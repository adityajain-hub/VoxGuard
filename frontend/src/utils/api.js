export const forensicUpload = async (audioFile, callerId = "CALLER-001", amount = "50000") => {
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("caller_id", callerId);
    formData.append("amount", amount);

    const res = await fetch("http://localhost:8000/api/analyze/forensic", {
        method: "POST",
        headers: { "X-API-Key": "SIH-VOX-2026" },
        body: formData
    });
    return await res.json();
};

export const createLiveWebSocket = (onMessageCallback) => {
    const ws = new WebSocket("ws://localhost:8000/ws/analyze/live");
    
    ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (onMessageCallback) {
            onMessageCallback(data);
        }
    };
    
    return ws;
};

export const fetchHistory = async () => {
    const res = await fetch("http://localhost:8000/api/history", {
        method: "GET",
        headers: { "X-API-Key": "SIH-VOX-2026" }
    });
    return await res.json();
};
