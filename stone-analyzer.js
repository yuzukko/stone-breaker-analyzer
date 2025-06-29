class StoneAnalyzer {
    constructor() {
        this.originalImage = document.getElementById('originalImage');
        this.analysisCanvas = document.getElementById('analysisCanvas');
        this.ctx = this.analysisCanvas.getContext('2d');
        this.imageContainer = document.getElementById('imageContainer');
        this.analysisResults = document.getElementById('analysisResults');
        this.loading = document.getElementById('loading');
        this.resultsContent = document.getElementById('resultsContent');
    }

    async analyzeStone(imageData) {
        this.showLoading();
        
        try {
            await this.processImage(imageData);
            const cracks = await this.detectCracks();
            const optimalPoints = this.calculateOptimalWedgePoints(cracks);
            this.visualizeResults(cracks, optimalPoints);
            this.displayResults(cracks, optimalPoints);
        } catch (error) {
            console.error('分析エラー:', error);
            alert('画像の分析中にエラーが発生しました。');
        } finally {
            this.hideLoading();
        }
    }

    async processImage(imageSrc) {
        return new Promise((resolve) => {
            this.originalImage.onload = () => {
                this.setupCanvas();
                resolve();
            };
            this.originalImage.src = imageSrc;
        });
    }

    resizeImageIfNeeded(canvas, ctx, maxWidth = 800) {
        if (canvas.width > maxWidth) {
            const ratio = maxWidth / canvas.width;
            const newWidth = maxWidth;
            const newHeight = canvas.height * ratio;
            
            const resizedCanvas = document.createElement('canvas');
            const resizedCtx = resizedCanvas.getContext('2d');
            resizedCanvas.width = newWidth;
            resizedCanvas.height = newHeight;
            
            resizedCtx.drawImage(canvas, 0, 0, newWidth, newHeight);
            return { canvas: resizedCanvas, ctx: resizedCtx };
        }
        return { canvas, ctx };
    }

    setupCanvas() {
        const img = this.originalImage;
        this.analysisCanvas.width = img.naturalWidth;
        this.analysisCanvas.height = img.naturalHeight;
        this.analysisCanvas.style.width = img.offsetWidth + 'px';
        this.analysisCanvas.style.height = img.offsetHeight + 'px';
        
        this.imageContainer.style.display = 'block';
    }

    async detectCracks() {
        const img = this.originalImage;
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        tempCtx.drawImage(img, 0, 0);
        
        // 画像サイズを制限してメモリ使用量を削減
        const { canvas: resizedCanvas, ctx: resizedCtx } = this.resizeImageIfNeeded(tempCanvas, tempCtx, 600);
        
        const imageData = resizedCtx.getImageData(0, 0, resizedCanvas.width, resizedCanvas.height);
        const data = imageData.data;
        
        const cracks = [];
        const width = resizedCanvas.width;
        const height = resizedCanvas.height;
        
        // 解析前にメモリをクリア
        if (window.gc) window.gc();
        
        const edgeData = this.detectEdges(data, width, height);
        
        const crackCandidates = this.findCrackCandidates(edgeData, width, height);
        
        for (let candidate of crackCandidates) {
            if (this.validateCrack(candidate, width, height)) {
                cracks.push(candidate);
            }
            // 最大10個のクラックに制限
            if (cracks.length >= 10) break;
        }
        
        return cracks;
    }

    detectEdges(data, width, height) {
        const edges = new Uint8Array(width * height);
        const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
        const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let gx = 0, gy = 0;
                
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                        const kernelIdx = (ky + 1) * 3 + (kx + 1);
                        
                        gx += gray * sobelX[kernelIdx];
                        gy += gray * sobelY[kernelIdx];
                    }
                }
                
                const magnitude = Math.sqrt(gx * gx + gy * gy);
                edges[y * width + x] = magnitude > 50 ? 255 : 0;
            }
        }
        
        return edges;
    }

    findCrackCandidates(edgeData, width, height) {
        const candidates = [];
        const visited = new Set();
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (edgeData[idx] > 0 && !visited.has(idx)) {
                    const crack = this.traceCrack(edgeData, width, height, x, y, visited);
                    if (crack.points.length > 20) {
                        candidates.push(crack);
                    }
                }
            }
        }
        
        return candidates;
    }

    traceCrack(edgeData, width, height, startX, startY, visited) {
        const crack = {
            points: [],
            length: 0,
            direction: null,
            strength: 0
        };
        
        const stack = [{x: startX, y: startY}];
        const maxPoints = 1000; // メモリ制限
        
        while (stack.length > 0 && crack.points.length < maxPoints) {
            const {x, y} = stack.pop();
            const idx = y * width + x;
            
            if (visited.has(idx) || x < 0 || x >= width || y < 0 || y >= height) {
                continue;
            }
            
            if (edgeData[idx] === 0) {
                continue;
            }
            
            // メモリ使用量チェック
            if (visited.size > 100000) {
                break;
            }
            
            visited.add(idx);
            crack.points.push({x, y});
            crack.strength += edgeData[idx];
            
            // スタックサイズ制限
            if (stack.length < 500) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        stack.push({x: x + dx, y: y + dy});
                    }
                }
            }
        }
        
        if (crack.points.length > 1) {
            crack.length = this.calculateCrackLength(crack.points);
            crack.direction = this.calculateCrackDirection(crack.points);
            crack.strength /= crack.points.length;
        }
        
        return crack;
    }

    calculateCrackLength(points) {
        let length = 0;
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i-1].x;
            const dy = points[i].y - points[i-1].y;
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }

    calculateCrackDirection(points) {
        if (points.length < 2) return 0;
        
        const start = points[0];
        const end = points[points.length - 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        
        return Math.atan2(dy, dx);
    }

    validateCrack(crack, width, height) {
        if (crack.points.length < 20) return false;
        if (crack.length < Math.min(width, height) * 0.1) return false;
        if (crack.strength < 100) return false;
        
        const linearity = this.calculateLinearity(crack.points);
        if (linearity < 0.7) return false;
        
        return true;
    }

    calculateLinearity(points) {
        if (points.length < 3) return 1;
        
        const start = points[0];
        const end = points[points.length - 1];
        const idealLength = Math.sqrt(
            Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
        );
        
        const actualLength = this.calculateCrackLength(points);
        return Math.min(idealLength / actualLength, 1);
    }

    calculateOptimalWedgePoints(cracks) {
        const points = [];
        
        for (let crack of cracks) {
            if (crack.length < 50) continue;
            
            const wedgePoints = this.findWedgePointsAlongCrack(crack);
            points.push(...wedgePoints);
        }
        
        const intersectionPoints = this.findCrackIntersections(cracks);
        points.push(...intersectionPoints);
        
        return this.optimizeWedgeLayout(points);
    }

    findWedgePointsAlongCrack(crack) {
        const points = [];
        const minSpacing = 100;
        
        for (let i = 0; i < crack.points.length; i += Math.floor(crack.points.length / 5)) {
            const point = crack.points[i];
            const priority = this.calculatePointPriority(point, crack);
            
            points.push({
                x: point.x,
                y: point.y,
                priority: priority,
                type: 'crack_point',
                angle: crack.direction
            });
        }
        
        return points;
    }

    findCrackIntersections(cracks) {
        const intersections = [];
        
        for (let i = 0; i < cracks.length; i++) {
            for (let j = i + 1; j < cracks.length; j++) {
                const intersection = this.findCrackIntersection(cracks[i], cracks[j]);
                if (intersection) {
                    intersection.priority = 'high';
                    intersection.type = 'intersection';
                    intersections.push(intersection);
                }
            }
        }
        
        return intersections;
    }

    findCrackIntersection(crack1, crack2) {
        const threshold = 10;
        
        for (let point1 of crack1.points) {
            for (let point2 of crack2.points) {
                const distance = Math.sqrt(
                    Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2)
                );
                
                if (distance < threshold) {
                    return {
                        x: (point1.x + point2.x) / 2,
                        y: (point1.y + point2.y) / 2,
                        distance: distance
                    };
                }
            }
        }
        
        return null;
    }

    calculatePointPriority(point, crack) {
        let priority = crack.strength / 255;
        
        if (crack.length > 200) priority += 0.3;
        if (crack.strength > 150) priority += 0.2;
        
        return Math.min(priority, 1);
    }

    optimizeWedgeLayout(points) {
        const minDistance = 80;
        const optimized = [];
        
        points.sort((a, b) => (b.priority || 0.5) - (a.priority || 0.5));
        
        for (let point of points) {
            let tooClose = false;
            
            for (let existing of optimized) {
                const distance = Math.sqrt(
                    Math.pow(point.x - existing.x, 2) + Math.pow(point.y - existing.y, 2)
                );
                
                if (distance < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                optimized.push(point);
            }
            
            if (optimized.length >= 8) break;
        }
        
        return optimized;
    }

    visualizeResults(cracks, wedgePoints) {
        this.ctx.clearRect(0, 0, this.analysisCanvas.width, this.analysisCanvas.height);
        
        this.ctx.strokeStyle = '#27ae60';
        this.ctx.lineWidth = 3;
        this.ctx.globalAlpha = 0.8;
        
        for (let crack of cracks) {
            this.ctx.beginPath();
            for (let i = 0; i < crack.points.length; i++) {
                const point = crack.points[i];
                if (i === 0) {
                    this.ctx.moveTo(point.x, point.y);
                } else {
                    this.ctx.lineTo(point.x, point.y);
                }
            }
            this.ctx.stroke();
        }
        
        for (let point of wedgePoints) {
            const size = 20;
            const priority = point.priority || 0.5;
            
            this.ctx.globalAlpha = 1;
            
            if (point.type === 'intersection' || priority > 0.7) {
                this.ctx.fillStyle = '#e74c3c';
            } else if (priority > 0.4) {
                this.ctx.fillStyle = '#f39c12';
            } else {
                this.ctx.fillStyle = '#3498db';
            }
            
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, size, 0, 2 * Math.PI);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('×', point.x, point.y + 5);
        }
    }

    displayResults(cracks, wedgePoints) {
        const highPriority = wedgePoints.filter(p => p.type === 'intersection' || (p.priority || 0) > 0.7);
        const mediumPriority = wedgePoints.filter(p => p.type !== 'intersection' && (p.priority || 0) > 0.4 && (p.priority || 0) <= 0.7);
        
        let html = '';
        html += `<div class="result-item"><span>検出された岩の目・割れ目</span><span>${cracks.length}箇所</span></div>`;
        html += `<div class="result-item"><span>高優先度セリ矢ポイント</span><span>${highPriority.length}箇所</span></div>`;
        html += `<div class="result-item"><span>中優先度セリ矢ポイント</span><span>${mediumPriority.length}箇所</span></div>`;
        html += `<div class="result-item"><span>推奨分割数</span><span>${Math.max(2, Math.ceil(wedgePoints.length / 2))}分割</span></div>`;
        
        this.resultsContent.innerHTML = html;
        this.analysisResults.style.display = 'block';
    }

    showLoading() {
        this.loading.style.display = 'block';
        this.analysisResults.style.display = 'none';
    }

    hideLoading() {
        this.loading.style.display = 'none';
    }
}

const analyzer = new StoneAnalyzer();

async function openCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            } 
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        
        const modal = createCameraModal(video, stream);
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('カメラアクセスエラー:', error);
        alert('カメラにアクセスできません。ファイル選択を使用してください。');
    }
}

function createCameraModal(video, stream) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    video.style.cssText = `
        max-width: 90%;
        max-height: 70%;
        border-radius: 10px;
    `;
    
    const captureBtn = document.createElement('button');
    captureBtn.textContent = '📷 撮影';
    captureBtn.className = 'btn btn-primary';
    captureBtn.style.cssText = `
        margin: 20px 10px;
        font-size: 18px;
        padding: 15px 30px;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ 閉じる';
    closeBtn.className = 'btn btn-secondary';
    closeBtn.style.cssText = `
        margin: 20px 10px;
        font-size: 18px;
        padding: 15px 30px;
    `;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.appendChild(captureBtn);
    buttonContainer.appendChild(closeBtn);
    
    modal.appendChild(video);
    modal.appendChild(buttonContainer);
    
    captureBtn.onclick = () => capturePhoto(video, stream, modal);
    closeBtn.onclick = () => closeCamera(stream, modal);
    
    return modal;
}

function capturePhoto(video, stream, modal) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    closeCamera(stream, modal);
    analyzer.analyzeStone(imageData);
}

function closeCamera(stream, modal) {
    stream.getTracks().forEach(track => track.stop());
    document.body.removeChild(modal);
}

function openFileSelector() {
    document.getElementById('fileInput').click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('画像ファイルを選択してください。');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        analyzer.analyzeStone(e.target.result);
    };
    reader.readAsDataURL(file);
}