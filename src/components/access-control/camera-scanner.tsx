"use client";

import { useEffect, useRef } from "react";

export default function CameraScanner({ onRead, onError }: { onRead: (code: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    let read = false;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled || !video.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video.current, (result, _error, active) => {
          if (!result || read || cancelled) return;
          read = true; active.stop(); onRead(result.getText());
        });
        stop = () => controls.stop();
        if (cancelled || read) stop();
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof Error ? error.name : "";
        onError(name === "NotAllowedError" ? "Permite usar la cámara en los ajustes del navegador o introduce el código manualmente."
          : name === "NotReadableError" ? "Otra aplicación está usando la cámara. Ciérrala o introduce el código manualmente."
          : "No pudimos iniciar la cámara. Usa HTTPS, comprueba que exista una cámara o introduce el código manualmente.");
      }
    }
    void start();
    const element = video.current;
    return () => {
      cancelled = true; stop?.();
      const stream = element?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
      if (element) element.srcObject = null;
    };
  }, [onRead, onError]);
  return <div className="overflow-hidden rounded-2xl border border-white/15 bg-black">
    <video ref={video} muted autoPlay playsInline aria-label="Cámara para leer el QR de la entrada" className="aspect-square w-full object-cover" />
    <p className="px-4 py-3 text-center text-sm text-white/70">Acerca el QR completo. La lectura enviará la validación automáticamente.</p>
  </div>;
}
