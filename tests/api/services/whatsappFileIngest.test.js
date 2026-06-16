/**
 * WhatsApp file → Google Drive handler. downloadWhatsAppMedia + createFile are
 * mocked; pins the success reply (with link), the download-failure path, the
 * Drive-not-connected path, and the upload-error path. Never throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const downloadMock = vi.fn();
const createFileMock = vi.fn();
vi.mock('../../../api/services/whatsappService.js', () => ({
  downloadWhatsAppMedia: (...a) => downloadMock(...a),
}));
vi.mock('../../../api/services/googleWorkspaceActions.js', () => ({
  createFile: (...a) => createFileMock(...a),
}));

const { handleFileUploadToDrive } = await import(
  '../../../api/services/transactions/whatsappFileIngest.js'
);

const DOC = { id: 'evolution:MID1', filename: 'contrato.pdf', mimeType: 'application/pdf' };

describe('handleFileUploadToDrive', () => {
  beforeEach(() => {
    downloadMock.mockReset();
    createFileMock.mockReset();
  });

  it('downloads + uploads to Drive and returns the link', async () => {
    downloadMock.mockResolvedValue(Buffer.from('PDFBYTES'));
    createFileMock.mockResolvedValue({ success: true, fileId: 'f1', name: 'contrato.pdf', webViewLink: 'https://drive/f1' });

    const r = await handleFileUploadToDrive('u1', DOC);

    expect(r.ok).toBe(true);
    expect(r.fileId).toBe('f1');
    expect(r.reply).toMatch(/Saved "contrato\.pdf"/);
    expect(r.reply).toMatch(/https:\/\/drive\/f1/);
    // The raw buffer + mime are passed through to createFile.
    expect(createFileMock).toHaveBeenCalledWith('u1', expect.objectContaining({
      name: 'contrato.pdf', mimeType: 'application/pdf', buffer: expect.any(Buffer),
    }));
  });

  it('asks the user to resend when the download fails', async () => {
    downloadMock.mockResolvedValue(null);
    const r = await handleFileUploadToDrive('u1', DOC);
    expect(r.ok).toBe(false);
    expect(r.reply).toMatch(/couldn't download/i);
    expect(createFileMock).not.toHaveBeenCalled();
  });

  it('tells the user to connect Drive when not authorized', async () => {
    downloadMock.mockResolvedValue(Buffer.from('x'));
    createFileMock.mockResolvedValue({ success: false, error: 'No google_gmail token — reconnect' });
    const r = await handleFileUploadToDrive('u1', DOC);
    expect(r.ok).toBe(false);
    expect(r.reply).toMatch(/Google Drive connected/i);
    expect(r.reply).toMatch(/Connect it in TwinMe settings/i);
  });

  it('degrades gracefully on a generic upload error', async () => {
    downloadMock.mockResolvedValue(Buffer.from('x'));
    createFileMock.mockResolvedValue({ success: false, error: 'Drive 500' });
    const r = await handleFileUploadToDrive('u1', DOC);
    expect(r.ok).toBe(false);
    expect(r.reply).toMatch(/couldn't save it to Drive/i);
  });

  it('never throws if createFile blows up', async () => {
    downloadMock.mockResolvedValue(Buffer.from('x'));
    createFileMock.mockRejectedValue(new Error('boom'));
    const r = await handleFileUploadToDrive('u1', DOC);
    expect(r.ok).toBe(false);
    expect(r.reply).toMatch(/problem saving it/i);
  });
});
