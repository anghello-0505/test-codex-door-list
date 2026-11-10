import QRCode from "qrcode";
import { isTicketCode } from "./ticket-code.ts";

export function ticketQr(code: string) {
  if (!isTicketCode(code)) throw new Error("Código de entrada inválido");
  const { modules } = QRCode.create(code, { errorCorrectionLevel: "M" });
  const margin = 4;
  const paths: string[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (!modules.get(row, column)) continue;
      const start = column;
      while (column + 1 < modules.size && modules.get(row, column + 1)) column++;
      paths.push(`M${start + margin} ${row + margin}h${column - start + 1}v1H${start + margin}z`);
    }
  }
  return { size: modules.size + margin * 2, path: paths.join("") };
}
