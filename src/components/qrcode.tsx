import { ComponentProps, onMount } from "solid-js";
import QRCodeJS from "qrcode";

export interface QRCodeProps
  extends ComponentProps<"canvas"> {
  value: string;
  dark?: string;
  light?: string;
  width?: number;
  logo?: string;
  logoSize?: number;
  logoShape?: "square" | "circle";
}

export const QRCode = (props: QRCodeProps) => {
  let canvasRef: HTMLCanvasElement | undefined;
  onMount(async () => {
    if (canvasRef) {
      await QRCodeJS.toCanvas(canvasRef, props.value, {
        color: {
          dark: props.dark ?? "#000000",
          light: props.light ?? "#ffffff",
        },
        width: props.width ?? 256,
      });

      if (props.logo) {
        const ctx = canvasRef.getContext("2d");
        if (ctx) {
          const img = new Image();
          img.onload = () => {
            const size =
              props.logoSize ?? canvasRef.width! / 6;
            const x = (canvasRef!.width - size) / 2;
            const y = (canvasRef!.height - size) / 2;

            if (props.logoShape === "circle") {
              ctx.save();
              ctx.beginPath();
              ctx.arc(
                x + size / 2,
                y + size / 2,
                size / 2,
                0,
                2 * Math.PI,
              );
              ctx.closePath();
              ctx.clip();
              ctx.drawImage(img, x, y, size, size);
              ctx.restore();
            } else {
              ctx.drawImage(img, x, y, size, size);
            }
          };
          img.src = props.logo;
        }
      }
    }
  });
  return <canvas ref={canvasRef} {...props} />;
};

export async function downloadQRCode(
  value: string,
  name: string,
) {
  const svg = await QRCodeJS.toString(value);
  const blob = new Blob([svg], {
    type: "image/svg+xml",
  });

  const dataurl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = dataurl;
  a.download = name;
  a.click();
}
