export async function rasterizeSvgToPng(svg: string): Promise<Buffer | undefined> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
    const sharpModule = (await dynamicImport("sharp")) as {
      default?: (input: Buffer) => { png: () => { toBuffer: () => Promise<Buffer> } };
    };
    const sharp = sharpModule.default;

    if (!sharp) {
      return undefined;
    }

    return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
  } catch {
    return undefined;
  }
}
