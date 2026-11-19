// 강의자료를 과목 폴더로 나눠 저장(11-19 사람 "받은 자료들을 데스크탑 혹은 폰에 잘 정리해서 저장하는 옵션").
// 파일은 서버가 eTL에서 받아 그대로 흘려보낸다(GET /api/etl/files/:id — 서버에 남기지 않음, worker/9_etl.js download).
// - 컴퓨터(크롬 · 엣지): 고른 폴더 안 'Tachyon 강의자료/<과목>/<파일>'. 이미 있는 파일은 건너뛴다 → 다시 누르면 새 자료만.
// - 안드로이드 앱: 폰 내려받기 관리자가 'Download/Tachyon 강의자료/<과목>/<파일>'로(app WidgetPlugin.download).
//   폴더를 들여다볼 수 없어 이 기기에서 저장한 자료 번호를 기억해 건너뛴다.
// - 그 밖(폰 브라우저 · 사파리 · 파이어폭스): 폴더에 쓸 수 없다 → canSave() false, 화면이 안내만.
//   ponytail: 필요해지면 zip 한 개로 내려받기
export const FOLDER = 'Tachyon 강의자료';
const SAVED_KEY = 'tachyon_saved_files';

/** 파일 · 폴더 이름에 못 쓰는 글자는 _로, 끝의 점 · 빈칸은 뺀다(윈도우) */
export const safeName = (s) =>
  String(s ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim() || '이름 없음';

const phone = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins?.TachyonWidget : null);
export const canSave = () => Boolean(phone() || window.showDirectoryPicker);

const readSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
  } catch {
    return [];
  }
};

/**
 * files = [{ id, course, title }]. onProgress({ saved, skipped, failed }) 한 개마다.
 * → { phone, saved, skipped, failed }, 폴더 고르기를 취소하면 null
 */
export async function saveFiles(files, onProgress = () => {}) {
  const r = { phone: false, saved: 0, skipped: 0, failed: 0 };
  const app = phone();
  if (app) {
    r.phone = true;
    const seen = new Set(readSaved());
    for (const f of files) {
      if (seen.has(f.id)) r.skipped++;
      else {
        try {
          await app.download({ api: `/api/etl/files/${f.id}`, to: `${FOLDER}/${safeName(f.course)}/${safeName(f.title)}` });
          seen.add(f.id);
          r.saved++;
        } catch (err) {
          if (err?.code === 'UNIMPLEMENTED' || /not implemented/i.test(err?.message)) throw new Error('폰 앱을 새로 깔아야 저장할 수 있어요(앱-시험판 APK)');
          r.failed++;
        }
      }
      onProgress(r);
    }
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify([...seen]));
    } catch {
      // 기억을 못 해도 저장은 됐다(다음에 같은 걸 또 받을 뿐)
    }
    return r;
  }

  let picked;
  try {
    picked = await window.showDirectoryPicker({ id: 'tachyon-files', mode: 'readwrite', startIn: 'documents' });
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    throw err;
  }
  const root = picked.name === FOLDER ? picked : await picked.getDirectoryHandle(FOLDER, { create: true });
  for (const f of files) {
    try {
      const dir = await root.getDirectoryHandle(safeName(f.course), { create: true });
      const name = safeName(f.title);
      if (await dir.getFileHandle(name).then(() => true, () => false)) r.skipped++;
      else {
        const res = await fetch(`/api/etl/files/${f.id}`, { credentials: 'include' });
        if (!res.ok) throw new Error(res.status);
        // 받다 끊기면 빈 파일을 지운다 — 남으면 다음에 '이미 있음'으로 건너뛰게 된다
        const file = await dir.getFileHandle(name, { create: true });
        await res.body.pipeTo(await file.createWritable()).catch(async (err) => {
          await dir.removeEntry(name).catch(() => {});
          throw err;
        });
        r.saved++;
      }
    } catch {
      r.failed++;
    }
    onProgress(r);
  }
  return r;
}
