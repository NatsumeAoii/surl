import { encodeToModules } from './encoder.ts';
import { renderToDataURL } from './render.ts';

export function generateQRCodeDataURL(text: string, size = 256): string {
    const modules = encodeToModules(text);
    return renderToDataURL(modules, size);
}
