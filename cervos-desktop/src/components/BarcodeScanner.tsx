import { useState, useEffect, useRef } from "react";

export default function BarcodeScanner({ onScan, onClose }: { onScan: (barcode: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [detectorSupported] = useState(() => typeof window !== 'undefined' && !!window.BarcodeDetector);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let scanInterval: number | null = null;

    async function startCamera() {
      if (!detectorSupported) {
        setError("Barcode scanning not supported. Please use manual entry below.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanInterval = window.setInterval(scanFrame, 200);
        }
      } catch {
        setError("Camera access denied. Please allow camera permissions or use manual entry below.");
      }
    }

    async function scanFrame() {
      if (!videoRef.current || !canvasRef.current || !window.BarcodeDetector) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA || video.videoWidth === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      try {
        const barcodeDetector = new window.BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"] });
        const barcodes = await barcodeDetector.detect(canvas);
        if (barcodes.length > 0) {
          onScan(barcodes[0].rawValue);
          return;
        }
      } catch {
      }
    }

    startCamera();
    return () => {
      if (scanInterval) clearInterval(scanInterval);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onScan, detectorSupported]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onScan(manualBarcode.trim());
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex flex-col z-50">
      <div className="flex items-center justify-between p-4 text-white">
        <h3 className="font-bold">Scan Barcode / QR</h3>
        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {detectorSupported ? (
          <>
            <video ref={videoRef} className="w-full max-h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-40 border-2 border-white rounded-lg" />
            </div>
          </>
        ) : (
          <div className="text-center text-white p-6">
            <span className="material-symbols-outlined text-6xl text-white/40">qr_code_scanner</span>
            <p className="mt-4 text-lg">Camera scanning not available</p>
            <p className="text-white/60 text-sm mt-2">Use Chrome on Android for camera scanning, or enter barcode manually below</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center text-white p-6">
              <span className="material-symbols-outlined text-5xl text-error">error</span>
              <p className="mt-2">{error}</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4">
        <form onSubmit={handleManualSubmit} className="flex gap-2 max-w-md mx-auto">
          <input
            type="text"
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="Enter barcode manually..."
            className="flex-1 px-4 py-3 rounded-lg bg-white text-black text-lg"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-lg bg-primary text-white font-bold"
          >
            Add
          </button>
        </form>
        <p className="text-center text-white/60 text-sm mt-2">
          {detectorSupported ? "Point camera at barcode or QR code" : "Enter barcode number above and press Add"}
        </p>
      </div>
    </div>
  );
}
