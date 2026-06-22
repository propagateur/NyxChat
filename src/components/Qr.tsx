import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function Qr({ text }: { text: string }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (!text) return;
    QRCode.toString(text, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0d12ff", light: "#00000000" },
    })
      .then(setSvg)
      .catch((e) => console.error("qr:", e));
  }, [text]);

  if (!text) return <div className="qr pending">adresse Tor en cours…</div>;
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
