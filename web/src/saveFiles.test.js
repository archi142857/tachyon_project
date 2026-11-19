// 강의자료 과목 폴더 저장(saveFiles.js): 이름 고치기, 컴퓨터 폴더(이미 있으면 건너뜀 · 실패하면 빈 파일 지움), 폰 앱(전에 받은 것 건너뜀)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLDER, safeName, saveFiles } from './saveFiles.js';

// 가짜 폴더: { name, kids: Map }. 파일은 문자열
function folder(name, kids = new Map()) {
  return {
    name,
    kids,
    async getDirectoryHandle(n, { create } = {}) {
      if (!kids.has(n)) {
        if (!create) throw new DOMException('없음', 'NotFoundError');
        kids.set(n, folder(n));
      }
      return kids.get(n);
    },
    async getFileHandle(n, { create } = {}) {
      if (!kids.has(n)) {
        if (!create) throw new DOMException('없음', 'NotFoundError');
        kids.set(n, '');
      }
      return {
        createWritable: async () => {
          let text = '';
          return new WritableStream({ write: (c) => void (text += new TextDecoder().decode(c)), close: () => void kids.set(n, text) });
        },
      };
    },
    async removeEntry(n) {
      kids.delete(n);
    },
  };
}

const files = [
  { id: 1, course: '예시 생물', title: '1주차.pdf' },
  { id: 2, course: '예시 생물', title: '2주차.pdf' },
  { id: 3, course: '예시/화학', title: '잠긴 자료.pdf' },
];

beforeEach(() => {
  const store = new Map();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) });
});
afterEach(() => vi.unstubAllGlobals());

describe('saveFiles', () => {
  it('파일 이름에 못 쓰는 글자는 _로', () => {
    expect(safeName('a/b:c?.pdf')).toBe('a_b_c_.pdf');
    expect(safeName('끝 점. ')).toBe('끝 점');
    expect(safeName('')).toBe('이름 없음');
  });

  it('컴퓨터: Tachyon 강의자료/<과목>/<파일>, 이미 있으면 건너뛰고 못 받은 건 빈 파일을 남기지 않는다', async () => {
    const picked = folder('문서');
    window.showDirectoryPicker = async () => picked;
    vi.stubGlobal('fetch', async (url) => (url.endsWith('/3') ? new Response('잠김', { status: 403 }) : new Response(`내용${url.at(-1)}`)));
    expect(await saveFiles(files)).toEqual({ phone: false, saved: 2, skipped: 0, failed: 1 });
    const root = picked.kids.get(FOLDER);
    expect(root.kids.get('예시 생물').kids.get('1주차.pdf')).toBe('내용1');
    expect(root.kids.get('예시_화학').kids.size).toBe(0);
    expect(await saveFiles(files)).toEqual({ phone: false, saved: 0, skipped: 2, failed: 1 }); // 다시 누르면 새 것만
  });

  it('폴더 고르기를 취소하면 null', async () => {
    window.showDirectoryPicker = async () => {
      throw new DOMException('취소', 'AbortError');
    };
    expect(await saveFiles(files)).toBeNull();
  });

  it('폰 앱: 내려받기 관리자에 과목 폴더 경로로 맡기고, 다음엔 전에 받은 것을 건너뛴다', async () => {
    const download = vi.fn(async () => {});
    window.Capacitor = { isNativePlatform: () => true, Plugins: { TachyonWidget: { download } } };
    expect(await saveFiles(files.slice(0, 1))).toEqual({ phone: true, saved: 1, skipped: 0, failed: 0 });
    expect(download).toHaveBeenCalledWith({ api: '/api/etl/files/1', to: `${FOLDER}/예시 생물/1주차.pdf` });
    expect(await saveFiles(files.slice(0, 2))).toEqual({ phone: true, saved: 1, skipped: 1, failed: 0 });
  });

  it('옛 폰 앱(download 없음)이면 새로 깔라고', async () => {
    const err = Object.assign(new Error('not implemented'), { code: 'UNIMPLEMENTED' });
    window.Capacitor = { isNativePlatform: () => true, Plugins: { TachyonWidget: { download: async () => Promise.reject(err) } } };
    await expect(saveFiles(files)).rejects.toThrow('새로 깔아야');
  });
});
