const canvas = document.getElementById("drawingBoard");
const ctx = canvas.getContext("2d");
const socket = new WebSocket("ws://ip:3000");

let drawing = false;
let color = "black";
let lastX = null, lastY = null;
let history = [];
let currentStroke = null;
let clientColor = null;
let remoteStrokes = {};
let fillToolActive = false;

// Színválasztás
document.querySelectorAll(".color-option").forEach((option) => {
    option.addEventListener("click", (event) => {
        color = event.target.getAttribute("data-color");
    });
});

// A statikus színek mellett a színválasztót is figyeljük
const colorPicker = document.getElementById("colorPicker");
colorPicker.addEventListener("change", (event) => {
    color = event.target.value;
});


// Radír
document.getElementById("eraser").addEventListener("click", () => {
    color = "white";
});

// Törlés
document.getElementById("clear").addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.send(JSON.stringify({ type: "clear" }));
    history = [];
});

// Undo
document.getElementById("undo").addEventListener("click", () => {
    if (history.length > 0) {
        const lastStroke = history.pop();
        socket.send(JSON.stringify({ type: "undo", data: { strokeId: lastStroke.id } }));
        redrawCanvas();
    }
});

// Fill tool
document.getElementById("fillTool").addEventListener("click", () => {
    fillToolActive = true;
    document.getElementById("fillTool").style.backgroundColor = "#bbb";
});


// Mentés
document.getElementById("saveImage").addEventListener("click", () => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.fillStyle = "white";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
    const link = document.createElement("a");
    link.href = tempCanvas.toDataURL("image/jpeg", 1.0);
    link.download = "drawing.jpg";
    link.click();
});

// Chat
document.getElementById("chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        const message = document.getElementById("chatInput").value;
        if (message.trim()) {
            const chatMessage = {
                type: "chat",
                data: { message: message }
            };
            const chatMessages = document.getElementById("chatMessages");
            const newMessage = document.createElement("div");
            newMessage.classList.add("message", "my-message");
            newMessage.textContent = message;
            chatMessages.appendChild(newMessage);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            socket.send(JSON.stringify(chatMessage));
            document.getElementById("chatInput").value = "";
        }
    }
});

// Rajzolás
canvas.addEventListener("mousedown", (event) => {
    if (fillToolActive) {
        const x = event.offsetX;
        const y = event.offsetY;
        const fillData = {
            id: Date.now() + "-" + Math.random().toString(36).substr(2, 5),
            type: "fill",
            x: x,
            y: y,
            color: color
        };
        floodFill(canvas, x, y, color);
        socket.send(JSON.stringify({ type: "fill", data: fillData }));
        history.push(fillData);
        fillToolActive = false;
        document.getElementById("fillTool").style.backgroundColor = "#ddd";
        return;
    }
    drawing = true;
    lastX = event.offsetX;
    lastY = event.offsetY;
    currentStroke = { id: Date.now() + "-" + Math.random().toString(36).substr(2, 5), segments: [] };
});

canvas.addEventListener("mousemove", (event) => {
    if (!drawing) return;
    const x = event.offsetX;
    const y = event.offsetY;
    ctx.strokeStyle = color;
    ctx.lineWidth = color === "white" ? 10 : 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    const segment = { lastX, lastY, x, y, color };
    currentStroke.segments.push(segment);
    socket.send(JSON.stringify({ type: "draw", data: { strokeId: currentStroke.id, segment } }));
    lastX = x;
    lastY = y;
});

canvas.addEventListener("mouseup", () => {
    drawing = false;
    if (currentStroke && currentStroke.segments.length > 0) {
        history.push(currentStroke);
        socket.send(JSON.stringify({ type: "finalize", data: { stroke: currentStroke } }));
        currentStroke = null;
    }
});

function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history.forEach((item) => {
        if (item.type === "fill") {
            // Fill parancs esetén visszavonjuk a kitöltést
            floodFill(canvas, item.x, item.y, item.color);
        } else {
            // Egyébként csak a vonalakat, amik rajzolva lettek
            item.segments.forEach((segment) => {
                ctx.strokeStyle = segment.color;
                ctx.lineWidth = segment.color === "white" ? 10 : 2;
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(segment.lastX, segment.lastY);
                ctx.lineTo(segment.x, segment.y);
                ctx.stroke();
            });
        }
    });
}


socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "color") {
        clientColor = msg.data;
    } else if (msg.type === "chat") {
        displayMessage(msg.data.message, msg.data.color);
    }
    if (msg.type === "draw") {
        const { strokeId, segment } = msg.data;
        ctx.strokeStyle = segment.color;
        ctx.lineWidth = segment.color === "white" ? 10 : 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(segment.lastX, segment.lastY);
        ctx.lineTo(segment.x, segment.y);
        ctx.stroke();
        if (!remoteStrokes[strokeId]) {
            remoteStrokes[strokeId] = { id: strokeId, segments: [] };
        }
        remoteStrokes[strokeId].segments.push(segment);
    } else if (msg.type === "finalize") {
        const stroke = msg.data.stroke;
        history.push(stroke);
        delete remoteStrokes[stroke.id];
    } else if (msg.type === "clear") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        history = [];
    } else if (msg.type === "undo") {
        const strokeId = msg.data.strokeId;
        history = history.filter(stroke => stroke.id !== strokeId);
        redrawCanvas();
    } else if (msg.type === "fill") {
        const { x, y, color } = msg.data;
        floodFill(canvas, x, y, color);
    }
    function displayMessage(message, color) {
        const chatMessages = document.getElementById("chatMessages");
        const newMessage = document.createElement("div");
        newMessage.classList.add("message");
        newMessage.style.backgroundColor = color;
        newMessage.textContent = message;
        chatMessages.appendChild(newMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
};


function floodFill(canvas, startX, startY, fillColor) {
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;

    const stack = [];
    const startPos = (startY * width + startX) * 4;
    const startColor = [data[startPos], data[startPos + 1], data[startPos + 2], data[startPos + 3]];
    const fillColorComponents = parseColor(fillColor);

    if (colorMatch(startColor, fillColorComponents)) return;
    stack.push({ x: startX, y: startY });

    while (stack.length) {
        const { x, y } = stack.pop();
        const currentPos = (y * width + x) * 4;
        const currentColor = [data[currentPos], data[currentPos + 1], data[currentPos + 2], data[currentPos + 3]];
        if (colorMatch(currentColor, startColor)) {
            data[currentPos] = fillColorComponents[0];
            data[currentPos + 1] = fillColorComponents[1];
            data[currentPos + 2] = fillColorComponents[2];
            data[currentPos + 3] = fillColorComponents[3];

            if (x > 0) stack.push({ x: x - 1, y });
            if (x < width - 1) stack.push({ x: x + 1, y });
            if (y > 0) stack.push({ x, y: y - 1 });
            if (y < height - 1) stack.push({ x, y: y + 1 });
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

// Szín parse
function parseColor(colorStr) {
    const tempDiv = document.createElement("div");
    tempDiv.style.color = colorStr;
    document.body.appendChild(tempDiv);
    const computedColor = getComputedStyle(tempDiv).color;
    document.body.removeChild(tempDiv);
    const parts = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (parts) {
        const r = parseInt(parts[1]);
        const g = parseInt(parts[2]);
        const b = parseInt(parts[3]);
        const a = parts[4] ? Math.floor(parseFloat(parts[4]) * 255) : 255;
        return [r, g, b, a];
    }
    return [0, 0, 0, 255];
}

function colorMatch(a, b) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
