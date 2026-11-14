import { HttpResponse } from '@angular/common/http';

/** File name from `Content-Disposition` (plain or RFC 5987 form), or the fallback when the header is missing. */
export function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      return fallback;
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : fallback;
}

/** Saves a blob downloaded through HttpClient (session cookie and global loading) with the server's file name. */
export function saveDownload(response: HttpResponse<Blob>, fallback: string): void {
  if (!response.body) return;
  const url = URL.createObjectURL(response.body);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFromDisposition(response.headers.get('Content-Disposition'), fallback);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url));
}
