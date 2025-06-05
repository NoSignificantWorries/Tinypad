document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
        const parent = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = parent.offsetWidth * dpr;
        canvas.height = parent.offsetHeight * dpr;
        canvas.style.width = parent.offsetWidth + 'px';
        canvas.style.height = parent.offsetHeight + 'px';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let textFontSize = 20;
    let textBold = false;
    let textItalic = false;
    let textUnderline = false;

    // --- Обработка UI выбора стиля ---
    function setupTextStyleUI() {
        const boldOption = document.getElementById('boldOption');
        const italicOption = document.getElementById('italicOption');
        const underlineOption = document.getElementById('underlineOption');
        const textSizeValue = document.getElementById('textSizeValue');
        const decreaseTextSize = document.getElementById('decreaseTextSize');
        const increaseTextSize = document.getElementById('increaseTextSize');

        if (boldOption) {
            boldOption.checked = textBold;
            boldOption.onchange = () => { textBold = boldOption.checked; };
        }
        if (italicOption) {
            italicOption.checked = textItalic;
            italicOption.onchange = () => { textItalic = italicOption.checked; };
        }
        if (underlineOption) {
            underlineOption.checked = textUnderline;
            underlineOption.onchange = () => { textUnderline = underlineOption.checked; };
        }
        if (textSizeValue) {
            textSizeValue.textContent = textFontSize;
        }
        if (decreaseTextSize) {
            decreaseTextSize.onclick = () => {
                textFontSize = Math.max(8, textFontSize - 2);
                if (textSizeValue) textSizeValue.textContent = textFontSize;
            };
        }
        if (increaseTextSize) {
            increaseTextSize.onclick = () => {
                textFontSize = Math.min(96, textFontSize + 2);
                if (textSizeValue) textSizeValue.textContent = textFontSize;
            };
        }
    }
    setupTextStyleUI();

    function syncTextStyleUIFromObj(obj) {
        textFontSize = parseInt((obj.font || "16px").match(/\d+/)[0], 10) || 16;
        textBold = (obj.font || "").includes("bold");
        textItalic = (obj.font || "").includes("italic");
        textUnderline = !!obj.underline;
        setupTextStyleUI();
    }

    // --- Вспомогательные функции для текста ---
    function getCurrentTextFont() {
        let font = '';
        if (textItalic) font += 'italic ';
        if (textBold) font += 'bold ';
        font += `${textFontSize}px sans-serif`;
        return font;
    }
    function getCurrentTextUnderline() {
        return textUnderline;
    }

    // --- Переменные для текста ---
    let editingTextObj = null;
    let textInput = null;

    let drawing = false;
    let startX = 0, startY = 0;
    let currentShape = null;
    const objects = [];

    function getCurrentColor() {
        return window.appState?.toolSettings?.color || '#000000';
    }
    function getCurrentLineWidth() {
        return 2;
    }
    function getCurrentTool() {
        if (window.appState?.activeTool === "shape") {
            return window.appState?.toolSettings?.shape?.type || "rectangle";
        }
        if (window.appState?.activeTool === "line") {
            return "line";
        }
        if (window.appState?.activeTool === "pencil") {
            return "pencil";
        }
        if (window.appState?.activeTool === "eraser") {
            return "eraser";
        }
        if (window.appState?.activeTool === "text") {
            return "text";
        }
        return null;
    }
    function getCurrentEraserType() {
        return window.appState?.toolSettings?.eraser?.type || "full";
    }

    // --- Hit-test helpers ---
    function pointNearLine(x, y, x0, y0, x1, y1, tolerance = 6) {
        const A = x - x0;
        const B = y - y0;
        const C = x1 - x0;
        const D = y1 - y0;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) {
            xx = x0;
            yy = y0;
        } else if (param > 1) {
            xx = x1;
            yy = y1;
        } else {
            xx = x0 + param * C;
            yy = y0 + param * D;
        }
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy) <= tolerance;
    }
    
    function pointInRect(x, y, x0, y0, x1, y1) {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    
    function pointNearRectOutline(x, y, x0, y0, x1, y1, tolerance = 6) {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        return (
            pointNearLine(x, y, minX, minY, maxX, minY, tolerance) ||
            pointNearLine(x, y, maxX, minY, maxX, maxY, tolerance) ||
            pointNearLine(x, y, maxX, maxY, minX, maxY, tolerance) ||
            pointNearLine(x, y, minX, maxY, minX, minY, tolerance)
        );
    }

    function pointNearEllipseOutline(x, y, x0, y0, x1, y1, tolerance = 6) {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        if (rx === 0 || ry === 0) return false;
        const norm = Math.sqrt(((x - cx) ** 2) / (rx * rx) + ((y - cy) ** 2) / (ry * ry));
        return Math.abs(norm - 1) <= (tolerance / Math.max(rx, ry));
    }

    function pointNearPolygonOutline(x, y, points, tolerance = 6) {
        for (let i = 0; i < points.length; i++) {
            const [x0, y0] = points[i];
            const [x1, y1] = points[(i + 1) % points.length];
            if (pointNearLine(x, y, x0, y0, x1, y1, tolerance)) return true;
        }
        return false;
    }

    function getPolygonPoints(shape, sides) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        const points = [];
        for (let i = 0; i < sides; i++) {
            const theta = (2 * Math.PI * i) / sides - Math.PI / 2;
            const x = centerX + rx * Math.cos(theta);
            const y = centerY + ry * Math.sin(theta);
            points.push([x, y]);
        }
        return points;
    }

    function getTrianglePoints(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        return [
            [(x0 + x1) / 2, y0],
            [x1, y1],
            [x0, y1]
        ];
    }

    function getRightTrianglePoints(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        return [
            [x0, y0],
            [x1, y1],
            [x0, y1]
        ];
    }

    function getDiamondPoints(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        return [
            [centerX, y0],
            [x1, centerY],
            [centerX, y1],
            [x0, centerY]
        ];
    }
    
    function getStarPoints(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        const outerRadius = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
        const innerRadius = outerRadius / 2.5;
        const spikes = 5;
        const points = [];
        
        for (let i = 0; i < spikes * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = Math.PI / spikes * i - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            points.push([x, y]);
        }
        
        return points;
    }
    
    function getArrowPoints(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const headlen = 20;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const angle = Math.atan2(dy, dx);
        
        return [
            [x0, y0],
            [x1, y1],
            [x1 - headlen * Math.cos(angle - Math.PI / 6), y1 - headlen * Math.sin(angle - Math.PI / 6)],
            [x1, y1],
            [x1 - headlen * Math.cos(angle + Math.PI / 6), y1 - headlen * Math.sin(angle + Math.PI / 6)]
        ];
    }
    
    function getDoubleArrowPoints(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const headlen = 20;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const angle = Math.atan2(dy, dx);
        
        return [
            [x0, y0],
            [x1, y1],
            [x1 - headlen * Math.cos(angle - Math.PI / 6), y1 - headlen * Math.sin(angle - Math.PI / 6)],
            [x1, y1],
            [x1 - headlen * Math.cos(angle + Math.PI / 6), y1 - headlen * Math.sin(angle + Math.PI / 6)],
            [x0, y0],
            [x0 + headlen * Math.cos(angle - Math.PI / 6), y0 + headlen * Math.sin(angle - Math.PI / 6)],
            [x0, y0],
            [x0 + headlen * Math.cos(angle + Math.PI / 6), y0 + headlen * Math.sin(angle + Math.PI / 6)]
        ];
    }

    function getHeartOutlinePoints(shape, steps = 200) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const width = Math.abs(x1 - x0);
        const height = Math.abs(y1 - y0);
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;

        const points = [];
        for (let t = 0; t <= 2 * Math.PI; t += (2 * Math.PI) / steps) {
            const xNorm = 16 * Math.pow(Math.sin(t), 3);
            const yNorm = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            const x = centerX + (xNorm / 32) * width;
            const y = centerY - (yNorm / 30) * height;
            points.push([x, y]);
        }
        return points;
    }

    function getCloudOutlinePoints(shape, steps = 60) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const width = Math.abs(x1 - x0);
        const height = Math.abs(y1 - y0);
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        const points = [];
        for (let t = Math.PI * 0.5; t <= Math.PI * 1.5; t += Math.PI / steps) {
            points.push([
                centerX - width * 0.2 + Math.cos(t) * height * 0.3,
                centerY + Math.sin(t) * height * 0.3
            ]);
        }
        for (let t = Math.PI; t <= 2 * Math.PI; t += Math.PI / steps) {
            points.push([
                centerX + Math.cos(t) * height * 0.4,
                centerY - height * 0.2 + Math.sin(t) * height * 0.4
            ]);
        }
        for (let t = Math.PI * 1.5; t <= Math.PI * 2.5; t += Math.PI / steps) {
            points.push([
                centerX + width * 0.2 + Math.cos(t) * height * 0.3,
                centerY + Math.sin(t) * height * 0.3
            ]);
        }
        return points;
    }

    // --- Partial eraser helpers ---
    function splitOutlineByEraser(points, x, y, tolerance = 8) {
        let eraseIndices = [];
        for (let j = 1; j < points.length; j++) {
            const [x0, y0] = points[j - 1];
            const [x1, y1] = points[j];
            if (pointNearLine(x, y, x0, y0, x1, y1, tolerance)) {
                eraseIndices.push(j);
            }
        }
        if (eraseIndices.length === 0) return null;
        const newSegments = [];
        let lastIdx = 0;
        for (const idx of eraseIndices) {
            if (idx - lastIdx > 1) {
                const seg = points.slice(lastIdx, idx);
                if (seg.length > 1) newSegments.push(seg);
            }
            lastIdx = idx;
        }
        if (points.length - lastIdx > 1) {
            const seg = points.slice(lastIdx);
            if (seg.length > 1) newSegments.push(seg);
        }
        return newSegments.length > 0 ? newSegments : null;
    }

    function getEllipseOutlinePoints(shape, steps = 60) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        const points = [];
        for (let t = 0; t <= 2 * Math.PI; t += (2 * Math.PI) / steps) {
            points.push([
                centerX + rx * Math.cos(t),
                centerY + ry * Math.sin(t)
            ]);
        }
        return points;
    }

    function hitTest(shape, x, y) {
        switch (shape.tool) {
            case 'pencil':
            case 'line':
                for (let i = 0; i < shape.points.length - 1; i++) {
                    if (pointNearLine(x, y, shape.points[i].x, shape.points[i].y, 
                                    shape.points[i+1].x, shape.points[i+1].y)) {
                        return true;
                    }
                }
                return false;
            case 'rectangle':
            case 'square':
                return pointNearRectOutline(x, y, shape.startX, shape.startY, shape.endX, shape.endY);
            case 'ellipse':
            case 'circle':
                return pointNearEllipseOutline(x, y, shape.startX, shape.startY, shape.endX, shape.endY);
            case 'diamond':
                return pointNearPolygonOutline(x, y, getDiamondPoints(shape));
            case 'pentagon':
                return pointNearPolygonOutline(x, y, getPolygonPoints(shape, 5));
            case 'hexagon':
                return pointNearPolygonOutline(x, y, getPolygonPoints(shape, 6));
            case 'octagon':
                return pointNearPolygonOutline(x, y, getPolygonPoints(shape, 8));
            case 'triangle':
                return pointNearPolygonOutline(x, y, getTrianglePoints(shape));
            case 'right-triangle':
                return pointNearPolygonOutline(x, y, getRightTrianglePoints(shape));
            case 'star':
                return pointNearPolygonOutline(x, y, getStarPoints(shape));
            case 'arrow':
                return pointNearPolygonOutline(x, y, getArrowPoints(shape));
            case 'double-arrow':
                return pointNearPolygonOutline(x, y, getDoubleArrowPoints(shape));
            case 'heart':
                return pointNearPolygonOutline(x, y, getHeartOutlinePoints(shape));
            case 'cloud':
                return pointNearPolygonOutline(x, y, getCloudOutlinePoints(shape));
            case 'text':
                ctx.font = shape.font || "20px sans-serif";
                const width = ctx.measureText(shape.text || "Текст").width;
                const height = parseInt((shape.font || "20px").match(/\d+/)[0], 10) || 20;
                return (x >= shape.x && x <= shape.x + width && y >= shape.y - height && y <= shape.y);
            default:
                return false;
        }
    }

    function getDenseOutlinePoints(obj, density = 40) {
        let points = [];
        switch (obj.tool) {
            case "rectangle":
            case "square": {
                // 4 стороны, равномерно по каждой
                const corners = [
                    [obj.startX, obj.startY],
                    [obj.endX, obj.startY],
                    [obj.endX, obj.endY],
                    [obj.startX, obj.endY],
                    [obj.startX, obj.startY]
                ];
                for (let i = 0; i < 4; i++) {
                    const [x0, y0] = corners[i];
                    const [x1, y1] = corners[i + 1];
                    for (let t = 0; t < density; t++) {
                        const k = t / density;
                        points.push([
                            x0 + (x1 - x0) * k,
                            y0 + (y1 - y0) * k
                        ]);
                    }
                }
                points.push(corners[0]);
                break;
            }
            case "ellipse":
            case "circle":
                points = getEllipseOutlinePoints(obj, density * 4);
                break;
            case "diamond": {
                const corners = getDiamondPoints(obj).concat([getDiamondPoints(obj)[0]]);
                for (let i = 0; i < 4; i++) {
                    const [x0, y0] = corners[i];
                    const [x1, y1] = corners[i + 1];
                    for (let t = 0; t < density; t++) {
                        const k = t / density;
                        points.push([
                            x0 + (x1 - x0) * k,
                            y0 + (y1 - y0) * k
                        ]);
                    }
                }
                points.push(corners[0]);
                break;
            }
            case "pentagon":
                points = getPolygonOutlineDense(obj, 5, density);
                break;
            case "hexagon":
                points = getPolygonOutlineDense(obj, 6, density);
                break;
            case "octagon":
                points = getPolygonOutlineDense(obj, 8, density);
                break;
            case "triangle":
                points = getPolygonOutlineDense({ ...obj, getPoints: getTrianglePoints }, 3, density);
                break;
            case "right-triangle":
                points = getPolygonOutlineDense({ ...obj, getPoints: getRightTrianglePoints }, 3, density);
                break;
            case "star":
                points = getPolygonOutlineDense({ ...obj, getPoints: getStarPoints }, 10, density);
                break;
            case "arrow":
                points = getPolygonOutlineDense({ ...obj, getPoints: getArrowPoints }, 5, density);
                break;
            case "double-arrow":
                points = getPolygonOutlineDense({ ...obj, getPoints: getDoubleArrowPoints }, 9, density);
                break;
            case "heart":
                points = getHeartOutlinePoints(obj, density * 4);
                break;
            case "cloud":
                points = getCloudOutlinePoints(obj, density * 2);
                break;
            default:
                break;
        }
        return points;
    }

    // Для многоугольников и фигур с getPoints
    function getPolygonOutlineDense(obj, sides, density = 40) {
        let basePoints = obj.getPoints ? obj.getPoints(obj) : getPolygonPoints(obj, sides);
        basePoints = basePoints.concat([basePoints[0]]);
        let points = [];
        for (let i = 0; i < basePoints.length - 1; i++) {
            const [x0, y0] = basePoints[i];
            const [x1, y1] = basePoints[i + 1];
            for (let t = 0; t < density; t++) {
                const k = t / density;
                points.push([
                    x0 + (x1 - x0) * k,
                    y0 + (y1 - y0) * k
                ]);
            }
        }
        points.push(basePoints[0]);
        return points;
    }

    // --- Eraser logic ---
    let erasing = false;
    let lastErasePoint = null;

   function showTextInput(obj, x, y, value) {
        // Удалить старый input, если есть
        if (textInput) {
            document.body.removeChild(textInput);
            textInput = null;
        }
        // Используем textarea для многострочного ввода
        textInput = document.createElement("textarea");
        textInput.value = value || "";
        textInput.style.position = "absolute";
        textInput.style.left = (canvas.getBoundingClientRect().left + x) + "px";
        textInput.style.top = (canvas.getBoundingClientRect().top + y - textFontSize) + "px";
        textInput.style.font = getCurrentTextFont();
        textInput.style.color = obj.color || "#000";
        textInput.style.zIndex = 1000;
        textInput.style.background = "rgba(255,255,255,0.8)";
        textInput.style.border = "2px solid #898989";
        textInput.style.padding = "6px 10px";
        textInput.style.minWidth = "40px";
        textInput.style.maxWidth = "300px";
        textInput.style.outline = "none";
        textInput.style.resize = "none";
        textInput.style.overflow = "hidden";
        textInput.style.borderRadius = `${textFontSize/2}px`;
        textInput.rows = 1;
        textInput.style.lineHeight = `${textFontSize*1.5}px`;
        textInput.style.fontWeight = textBold ? "bold" : "normal";
        textInput.style.fontStyle = textItalic ? "italic" : "normal";
        textInput.style.textDecoration = textUnderline ? "underline" : "none";
        document.body.appendChild(textInput);
        textInput.focus();

        function updateTextInputStyle() {
            textInput.style.font = getCurrentTextFont();
            textInput.style.fontWeight = textBold ? "bold" : "normal";
            textInput.style.fontStyle = textItalic ? "italic" : "normal";
            textInput.style.textDecoration = textUnderline ? "underline" : "none";
            textInput.style.lineHeight = `${textFontSize}px`;
        }

        const boldOption = document.getElementById('boldOption');
        const italicOption = document.getElementById('italicOption');
        const underlineOption = document.getElementById('underlineOption');
        const decreaseTextSize = document.getElementById('decreaseTextSize');
        const increaseTextSize = document.getElementById('increaseTextSize');

        if (boldOption) boldOption.onchange = () => { textBold = boldOption.checked; updateTextInputStyle(); };
        if (italicOption) italicOption.onchange = () => { textItalic = italicOption.checked; updateTextInputStyle(); };
        if (underlineOption) underlineOption.onchange = () => { textUnderline = underlineOption.checked; updateTextInputStyle(); };
        if (decreaseTextSize) decreaseTextSize.onclick = () => {
            textFontSize = Math.max(8, textFontSize - 2);
            updateTextInputStyle();
            setupTextStyleUI();
        };
        if (increaseTextSize) increaseTextSize.onclick = () => {
            textFontSize = Math.min(96, textFontSize + 2);
            updateTextInputStyle();
            setupTextStyleUI();
        };

        // Автоматически подгонять ширину/высоту под текст
        function autoResize() {
            textInput.style.height = "auto";
            textInput.style.height = textInput.scrollHeight + "px";
            textInput.style.width = "auto";
            textInput.style.width = (textInput.scrollWidth + 10) + "px";
        }
        textInput.addEventListener('input', autoResize);
        autoResize();

        // Завершить ввод по blur или Esc
        function finishEdit() {
            if (editingTextObj) {
                editingTextObj.text = textInput.value;
                editingTextObj.font = getCurrentTextFont();
                editingTextObj.underline = textUnderline;
            }
            if (textInput) {
                document.body.removeChild(textInput);
                textInput = null;
            }
            editingTextObj = null;
            redraw();
        }
        textInput.onblur = finishEdit;
        textInput.onkeydown = function(e) {
            if (e.key === "Escape") {
                finishEdit();
            }
        };
    }

    canvas.addEventListener('mousedown', function(e) {
        const tool = getCurrentTool();
        if (!tool) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);
        startX = x;
        startY = y;

        if (tool === "text") {
            // Если уже есть активный input, завершаем ввод
            if (textInput) {
                document.body.removeChild(textInput);
                textInput = null;
                // После blur input удалится и editingTextObj сбросится
                // Новый input появится ниже, если нужно
            }

            // Проверяем, кликнули ли по существующему тексту
            let found = false;
            for (let i = objects.length - 1; i >= 0; i--) {
                const obj = objects[i];
                if (obj.tool === "text" && hitTest(obj, x, y)) {
                    editingTextObj = obj;
                    syncTextStyleUIFromObj(obj);
                    // ВАЖНО: showTextInput вызываем с задержкой!
                    setTimeout(() => {
                        showTextInput(obj, obj.x, obj.y, obj.text);
                    }, 0);
                    found = true;
                    break;
                }
            }
            if (!found) {
                editingTextObj = {
                    tool: "text",
                    color: getCurrentColor(),
                    x: x,
                    y: y,
                    text: "",
                    font: getCurrentTextFont(),
                    underline: textUnderline
                };
                objects.push(editingTextObj);
                setTimeout(() => {
                    showTextInput(editingTextObj, x, y, "");
                }, 0);
            }
            redraw();
            return;
        }

        if (tool === "eraser") {
            erasing = true;
            lastErasePoint = {x: startX, y: startY};
            const eraserType = getCurrentEraserType(); // "full" или "partial"
            if (eraserType === "full") {
                let erased = false;
                for (let i = objects.length - 1; i >= 0; i--) {
                    if (hitTest(objects[i], startX, startY)) {
                        objects.splice(i, 1);
                        erased = true;
                    }
                }
                if (erased) redraw();
            } else if (eraserType === "partial") {
                let erased = false;
                for (let i = objects.length - 1; i >= 0; i--) {
                    const obj = objects[i];
                    // partial-ластик для line теперь как для pencil
                    if (obj.tool === "line" || obj.tool === "pencil") {
                        let eraseIndices = [];
                        for (let j = 1; j < obj.points.length; j++) {
                            const p0 = obj.points[j - 1];
                            const p1 = obj.points[j];
                            if (pointNearLine(x, y, p0.x, p0.y, p1.x, p1.y, 8)) {
                                eraseIndices.push(j);
                            }
                        }
                        if (eraseIndices.length > 0) {
                            const newSegments = [];
                            let lastIdx = 0;
                            for (const idx of eraseIndices) {
                                if (idx - lastIdx > 1) {
                                    const seg = obj.points.slice(lastIdx, idx);
                                    if (seg.length > 1) newSegments.push(seg);
                                }
                                lastIdx = idx;
                            }
                            if (obj.points.length - lastIdx > 1) {
                                const seg = obj.points.slice(lastIdx);
                                if (seg.length > 1) newSegments.push(seg);
                            }
                            if (newSegments.length > 0) {
                                for (const seg of newSegments) {
                                    objects.push({
                                        ...obj,
                                        points: seg
                                    });
                                }
                                objects.splice(i, 1);
                                erased = true;
                                break;
                            }
                        }
                    } else if (
                        obj.tool === "rectangle" ||
                        obj.tool === "square" ||
                        obj.tool === "ellipse" ||
                        obj.tool === "circle" ||
                        obj.tool === "diamond" ||
                        obj.tool === "pentagon" ||
                        obj.tool === "hexagon" ||
                        obj.tool === "octagon" ||
                        obj.tool === "triangle" ||
                        obj.tool === "right-triangle" ||
                        obj.tool === "star" ||
                        obj.tool === "arrow" ||
                        obj.tool === "double-arrow" ||
                        obj.tool === "heart" ||
                        obj.tool === "cloud"
                    ) {
                        // Получаем outline точки
                        let points = getDenseOutlinePoints(obj, 40); // 40 — плотность, можно увеличить
                        const newSegments = splitOutlineByEraser(points, x, y, 8);
                        if (newSegments) {
                            for (const seg of newSegments) {
                                let newObj = { ...obj };
                                newObj.points = seg.map(([x, y]) => ({ x, y }));
                                newObj.tool = "pencil";
                                delete newObj.startX;
                                delete newObj.startY;
                                delete newObj.endX;
                                delete newObj.endY;
                                objects.push(newObj);
                            }
                            objects.splice(i, 1);
                            erased = true;
                            break;
                        }
                    }
                }
                if (erased) redraw();
            }
            return;
        }

        // Обычный режим рисования
        drawing = true;
        if (tool === "pencil" || tool === "line") {
            currentShape = {
                tool: tool,
                color: getCurrentColor(),
                points: [{ x: startX, y: startY }]
            };
        } else {
            currentShape = {
                tool: tool,
                color: getCurrentColor(),
                startX, startY,
                endX: startX, endY: startY
            };
        }
    });

    canvas.addEventListener('mousemove', function(e) {
        const tool = getCurrentTool();
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);

        if (tool === "eraser" && erasing) {
            const eraserType = getCurrentEraserType();
            if (eraserType === "full") {
                let erased = false;
                for (let i = objects.length - 1; i >= 0; i--) {
                    if (hitTest(objects[i], x, y)) {
                        objects.splice(i, 1);
                        erased = true;
                    }
                }
                if (erased) redraw();
            } else if (eraserType === "partial") {
                let erased = false;
                for (let i = objects.length - 1; i >= 0; i--) {
                    const obj = objects[i];
                    // partial-ластик для line теперь как для pencil
                    if (obj.tool === "line" || obj.tool === "pencil") {
                        let eraseIndices = [];
                        for (let j = 1; j < obj.points.length; j++) {
                            const p0 = obj.points[j - 1];
                            const p1 = obj.points[j];
                            if (pointNearLine(x, y, p0.x, p0.y, p1.x, p1.y, 8)) {
                                eraseIndices.push(j);
                            }
                        }
                        if (eraseIndices.length > 0) {
                            const newSegments = [];
                            let lastIdx = 0;
                            for (const idx of eraseIndices) {
                                if (idx - lastIdx > 1) {
                                    const seg = obj.points.slice(lastIdx, idx);
                                    if (seg.length > 1) newSegments.push(seg);
                                }
                                lastIdx = idx;
                            }
                            if (obj.points.length - lastIdx > 1) {
                                const seg = obj.points.slice(lastIdx);
                                if (seg.length > 1) newSegments.push(seg);
                            }
                            if (newSegments.length > 0) {
                                for (const seg of newSegments) {
                                    objects.push({
                                        ...obj,
                                        points: seg
                                    });
                                }
                                objects.splice(i, 1);
                                erased = true;
                                break;
                            }
                        }
                    } else if (
                        obj.tool === "rectangle" ||
                        obj.tool === "square" ||
                        obj.tool === "ellipse" ||
                        obj.tool === "circle" ||
                        obj.tool === "diamond" ||
                        obj.tool === "pentagon" ||
                        obj.tool === "hexagon" ||
                        obj.tool === "octagon" ||
                        obj.tool === "triangle" ||
                        obj.tool === "right-triangle" ||
                        obj.tool === "star" ||
                        obj.tool === "arrow" ||
                        obj.tool === "double-arrow" ||
                        obj.tool === "heart" ||
                        obj.tool === "cloud"
                    ) {
                        let points = getDenseOutlinePoints(obj, 40); // 40 — плотность, можно увеличить
                        const newSegments = splitOutlineByEraser(points, x, y, 8);
                        if (newSegments) {
                            for (const seg of newSegments) {
                                let newObj = { ...obj };
                                newObj.points = seg.map(([x, y]) => ({ x, y }));
                                newObj.tool = "pencil";
                                delete newObj.startX;
                                delete newObj.startY;
                                delete newObj.endX;
                                delete newObj.endY;
                                objects.push(newObj);
                            }
                            objects.splice(i, 1);
                            erased = true;
                            break;
                        }
                    }
                }
                if (erased) redraw();
            }
            lastErasePoint = {x, y};
            return;
        }

        if (!drawing) return;
        const endX = x;
        const endY = y;

        if (currentShape && (currentShape.tool === "pencil" || currentShape.tool === "line")) {
            currentShape.points.push({ x: endX, y: endY });
        } else if (currentShape) {
            currentShape.endX = endX;
            currentShape.endY = endY;
        }

        redraw();
        drawShape(currentShape, true);
    });

    canvas.addEventListener('mouseup', function(e) {
        const tool = getCurrentTool();
        if (tool === "eraser") {
            erasing = false;
            lastErasePoint = null;
            return;
        }
        if (!drawing) return;
        drawing = false;
        objects.push({...currentShape});
        redraw();
        currentShape = null;
    });

    function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const obj of objects) {
            drawShape(obj, false);
        }
    }

    function bezierLine(shape) {
        // Если есть points, рисуем как pencil (свободная линия)
        if (shape.points && shape.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            for (let i = 1; i < shape.points.length; i++) {
                const p0 = shape.points[i - 1];
                const p1 = shape.points[i];
                ctx.bezierCurveTo(p0.x, p0.y, p1.x, p1.y, p1.x, p1.y);
            }
            ctx.stroke();
        } else if (shape.startX !== undefined && shape.endX !== undefined) {
            // Старый режим: просто прямая
            ctx.beginPath();
            ctx.moveTo(shape.startX, shape.startY);
            ctx.bezierCurveTo(shape.startX, shape.startY, shape.endX, shape.endY, shape.endX, shape.endY);
            ctx.stroke();
        }
    }

   function drawShape(shape, isPreview) {
        if (!shape) return;
        ctx.save();
        ctx.strokeStyle = shape.color;
        ctx.fillStyle = shape.color;
        ctx.lineWidth = getCurrentLineWidth();

        switch (shape.tool) {
            case 'text':
                ctx.font = shape.font || "20px sans-serif";
                ctx.fillStyle = shape.color || "#000";
                ctx.textBaseline = "bottom";
                // Поддержка переносов строк
                const lines = shape.text ? shape.text.split('\n') : [];
                if (!lines.length) break;
                const fontSize = parseInt((shape.font || "20px").match(/\d+/)[0], 10) || 20;
                let y = shape.y;
                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i], shape.x, y);
                    // Подчеркивание для каждой строки
                    if (shape.underline) {
                        const width = ctx.measureText(lines[i]).width;
                        ctx.beginPath();
                        ctx.moveTo(shape.x, y + 2);
                        ctx.lineTo(shape.x + width, y + 2);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = shape.color || "#000";
                        ctx.stroke();
                    }
                    y += fontSize * 1.5; // Межстрочный интервал
                }
                break;
            case 'pencil':
                bezierPencil(shape);
                break;
            case 'circle':
                bezierCircle(shape);
                break;
            case 'rectangle':
                bezierRect(shape);
                break;
            case 'square':
                bezierSquare(shape);
                break;
            case 'ellipse':
                bezierEllipse(shape);
                break;
            case 'triangle':
                bezierTriangle(shape);
                break;
            case 'right-triangle':
                bezierRightTriangle(shape);
                break;
            case 'star':
                bezierStar(shape);
                break;
            case 'pentagon':
                bezierPolygon(shape, 5);
                break;
            case 'hexagon':
                bezierPolygon(shape, 6);
                break;
            case 'octagon':
                bezierPolygon(shape, 8);
                break;
            case 'diamond':
                bezierDiamond(shape);
                break;
            case 'double-arrow':
                bezierDoubleArrow(shape);
                break;
            case 'arrow':
                bezierArrow(shape);
                break;
            case 'heart':
                bezierHeart(shape);
                break;
            case 'cloud':
                bezierCloud(shape);
                break;
            case 'line':
                bezierLine(shape);
                break;
            default:
                break;
        }
        ctx.restore();
    }

    // --- Drawing functions ---
    function bezierPencil(shape) {
        if (!shape.points || shape.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
            const p0 = shape.points[i - 1];
            const p1 = shape.points[i];
            ctx.bezierCurveTo(p0.x, p0.y, p1.x, p1.y, p1.x, p1.y);
        }
        ctx.stroke();
    }
    function bezierCircle(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        const radius = Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2)) / 2;
        const c = radius * 0.552284749831;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - radius);
        ctx.bezierCurveTo(centerX + c, centerY - radius, centerX + radius, centerY - c, centerX + radius, centerY);
        ctx.bezierCurveTo(centerX + radius, centerY + c, centerX + c, centerY + radius, centerX, centerY + radius);
        ctx.bezierCurveTo(centerX - c, centerY + radius, centerX - radius, centerY + c, centerX - radius, centerY);
        ctx.bezierCurveTo(centerX - radius, centerY - c, centerX - c, centerY - radius, centerX, centerY - radius);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierRect(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x0, y0, x1, y0, x1, y0);
        ctx.bezierCurveTo(x1, y0, x1, y1, x1, y1);
        ctx.bezierCurveTo(x1, y1, x0, y1, x0, y1);
        ctx.bezierCurveTo(x0, y1, x0, y0, x0, y0);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierSquare(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const side = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0));
        const sx = Math.sign(x1 - x0) * side;
        const sy = Math.sign(y1 - y0) * side;
        bezierRect({startX: x0, startY: y0, endX: x0 + sx, endY: y0 + sy});
    }
    function bezierEllipse(shape) {
        const x0 = shape.startX, y0 = shape.startY;
        const x1 = shape.endX, y1 = shape.endY;
        const centerX = (x0 + x1) / 2;
        const centerY = (y0 + y1) / 2;
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        const c = 0.552284749831;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - ry);
        ctx.bezierCurveTo(centerX + c * rx, centerY - ry, centerX + rx, centerY - c * ry, centerX + rx, centerY);
        ctx.bezierCurveTo(centerX + rx, centerY + c * ry, centerX + c * rx, centerY + ry, centerX, centerY + ry);
        ctx.bezierCurveTo(centerX - c * rx, centerY + ry, centerX - rx, centerY + c * ry, centerX - rx, centerY);
        ctx.bezierCurveTo(centerX - rx, centerY - c * ry, centerX - c * rx, centerY - ry, centerX, centerY - ry);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierTriangle(shape) {
        const points = getTrianglePoints(shape);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.bezierCurveTo(points[2][0], points[2][1], points[0][0], points[0][1], points[0][0], points[0][1]);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierRightTriangle(shape) {
        const points = getRightTrianglePoints(shape);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.bezierCurveTo(points[2][0], points[2][1], points[0][0], points[0][1], points[0][0], points[0][1]);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierPolygon(shape, sides) {
        const points = getPolygonPoints(shape, sides);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            const [x0, y0] = points[i - 1];
            const [x1, y1] = points[i];
            ctx.bezierCurveTo(x0, y0, x1, y1, x1, y1);
        }
        const [x0, y0] = points[points.length - 1];
        const [x1, y1] = points[0];
        ctx.bezierCurveTo(x0, y0, x1, y1, x1, y1);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierStar(shape) {
        const points = getStarPoints(shape);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.bezierCurveTo(points[points.length - 1][0], points[points.length - 1][1], points[0][0], points[0][1], points[0][0], points[0][1]);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierDiamond(shape) {
        const points = getDiamondPoints(shape);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.bezierCurveTo(points[3][0], points[3][1], points[0][0], points[0][1], points[0][0], points[0][1]);
        ctx.closePath();
        ctx.stroke();
    }
    function bezierArrow(shape) {
        const points = getArrowPoints(shape);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.stroke();
    }
    function bezierDoubleArrow(shape) {
        const points = getDoubleArrowPoints(shape);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.stroke();
    }
    function bezierHeart(shape) {
        const points = getHeartOutlinePoints(shape, 60);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.bezierCurveTo(points[points.length - 1][0], points[points.length - 1][1], points[0][0], points[0][1], points[0][0], points[0][1]);
        ctx.closePath();
        ctx.stroke();
    }

    function bezierCloud(shape) {
        const points = getCloudOutlinePoints(shape, 20);
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.bezierCurveTo(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], points[i][0], points[i][1]);
        }
        ctx.bezierCurveTo(points[points.length - 1][0], points[points.length - 1][1], points[0][0], points[0][1], points[0][0], points[0][1]);
        ctx.closePath();
        ctx.stroke();
    }

    function getLineSplitT(line, x, y) {
        const x0 = line.startX, y0 = line.startY;
        const x1 = line.endX, y1 = line.endY;
        const dx = x1 - x0, dy = y1 - y0;
        const len_sq = dx * dx + dy * dy;
        if (len_sq === 0) return null;
        const t = ((x - x0) * dx + (y - y0) * dy) / len_sq;
        if (t < 0 || t > 1) return null;
        return t;
    }

    window.clearCanvas = function() {
        objects.length = 0;
        redraw();
    };

    window.appState = window.appState || {};
});