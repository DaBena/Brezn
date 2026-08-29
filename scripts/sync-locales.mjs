/**
 * Sync locale files: patches for existing langs + seed new langs from en + overrides.
 * Run: node scripts/sync-locales.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = 'src/locales'

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return patch ?? base
  if (Array.isArray(patch)) return patch
  const out = { ...base }
  for (const k of Object.keys(patch)) {
    const bv = base?.[k]
    const pv = patch[k]
    if (
      pv !== null &&
      typeof pv === 'object' &&
      !Array.isArray(pv) &&
      typeof bv === 'object' &&
      bv !== null &&
      !Array.isArray(bv)
    ) {
      out[k] = deepMerge(bv, pv)
    } else {
      out[k] = pv
    }
  }
  return out
}

/** Shared compact strings for geohash mode 0 + composer manual mode */
const GEO_COMPOSER = {
  de: {
    geohash: { queries3: 'alle g-Tags', queriesCurrent: 'alle geotaggten Posts' },
    composer: {
      invalidGeohash: 'Ungültiger Geohash.',
      editGeohashAria: 'Geohash bearbeiten',
      createInCell: 'Neuer Post in Zelle',
      createNew: 'Neuer Post',
    },
  },
  es: {
    geohash: { queries3: 'todos los g', queriesCurrent: 'posts geolocalizados' },
    composer: {
      invalidGeohash: 'Geohash no válido.',
      editGeohashAria: 'Editar geohash',
      createInCell: 'Nuevo post en celda',
      createNew: 'Nuevo post',
    },
  },
  fr: {
    geohash: { queries3: 'tous les g', queriesCurrent: 'posts géolocalisés' },
    composer: {
      invalidGeohash: 'Geohash invalide.',
      editGeohashAria: 'Modifier le geohash',
      createInCell: 'Nouveau post (cellule)',
      createNew: 'Nouveau post',
    },
  },
  it: {
    geohash: { queries3: 'tutti i g', queriesCurrent: 'post geotaggati' },
    composer: {
      invalidGeohash: 'Geohash non valido.',
      editGeohashAria: 'Modifica geohash',
      createInCell: 'Nuovo post in cella',
      createNew: 'Nuovo post',
    },
  },
  pt: {
    geohash: { queries3: 'todos os g', queriesCurrent: 'posts georreferenciados' },
    composer: {
      invalidGeohash: 'Geohash inválido.',
      editGeohashAria: 'Editar geohash',
      createInCell: 'Novo post na célula',
      createNew: 'Novo post',
    },
  },
  ru: {
    geohash: { queries3: 'все g', queriesCurrent: 'все геопосты' },
    composer: {
      invalidGeohash: 'Неверный geohash.',
      editGeohashAria: 'Изменить geohash',
      createInCell: 'Новый пост в ячейке',
      createNew: 'Новый пост',
    },
  },
  ja: {
    geohash: { queries3: 'すべての g', queriesCurrent: '位置付き投稿' },
    composer: {
      invalidGeohash: '無効な geohash。',
      editGeohashAria: 'geohash を編集',
      createInCell: 'セル内の新規投稿',
      createNew: '新規投稿',
    },
  },
  'zh-CN': {
    geohash: { queries3: '全部 g', queriesCurrent: '全部定位帖' },
    composer: {
      invalidGeohash: 'Geohash 无效。',
      editGeohashAria: '编辑 geohash',
      createInCell: '在此格发新帖',
      createNew: '新发帖',
    },
  },
  'zh-TW': {
    geohash: { queries3: '全部 g', queriesCurrent: '全部定位貼文' },
    composer: {
      invalidGeohash: 'Geohash 無效。',
      editGeohashAria: '編輯 geohash',
      createInCell: '在此格發新貼',
      createNew: '新發文',
    },
  },
  ar: {
    geohash: { queries3: 'كل g', queriesCurrent: 'كل المنشورات المموّجة' },
    composer: {
      invalidGeohash: 'Geohash غير صالح.',
      editGeohashAria: 'تعديل geohash',
      createInCell: 'منشور جديد في الخلية',
      createNew: 'منشور جديد',
    },
  },
  tr: {
    geohash: { queries3: 'tüm g', queriesCurrent: 'tüm konumlu gönderiler' },
    composer: {
      invalidGeohash: 'Geçersiz geohash.',
      editGeohashAria: 'Geohash düzenle',
      createInCell: 'Hücrede yeni gönderi',
      createNew: 'Yeni gönderi',
    },
  },
  fa: {
    geohash: { queries3: 'همه g', queriesCurrent: 'همه پست‌های مکان‌دار' },
    composer: {
      invalidGeohash: 'Geohash نامعتبر.',
      editGeohashAria: 'ویرایش geohash',
      createInCell: 'پست جدید در سلول',
      createNew: 'پست جدید',
    },
  },
  hi: {
    geohash: { queries3: 'सभी g', queriesCurrent: 'सभी जियो पोस्ट' },
    composer: {
      invalidGeohash: 'अमान्य geohash.',
      editGeohashAria: 'Geohash संपादित करें',
      createInCell: 'सेल में नई पोस्ट',
      createNew: 'नई पोस्ट',
    },
  },
  ko: {
    geohash: { queries3: '모든 g', queriesCurrent: '위치 게시물 전체' },
    composer: {
      invalidGeohash: '잘못된 geohash.',
      editGeohashAria: 'geohash 편집',
      createInCell: '셀에 새 게시물',
      createNew: '새 게시물',
    },
  },
  vi: {
    geohash: { queries3: 'mọi g', queriesCurrent: 'mọi bài có vị trí' },
    composer: {
      invalidGeohash: 'Geohash không hợp lệ.',
      editGeohashAria: 'Sửa geohash',
      createInCell: 'Bài mới trong ô',
      createNew: 'Bài mới',
    },
  },
  pl: {
    geohash: { queries3: 'wszystkie g', queriesCurrent: 'wszystkie posty geo' },
    composer: {
      invalidGeohash: 'Nieprawidłowy geohash.',
      editGeohashAria: 'Edytuj geohash',
      createInCell: 'Nowy post w komórce',
      createNew: 'Nowy post',
    },
  },
  nl: {
    geohash: { queries3: 'alle g', queriesCurrent: 'alle geo-posts' },
    composer: {
      invalidGeohash: 'Ongeldige geohash.',
      editGeohashAria: 'Geohash bewerken',
      createInCell: 'Nieuwe post in cel',
      createNew: 'Nieuwe post',
      publishAria: 'Plaatsen',
    },
    thread: {
      blockUserAria: 'Blokkeren',
      blockUserTitle: 'Blokkeren',
      offlineBlock: 'Offline – blokkeren niet mogelijk.',
      userBlocked: 'Geblokkeerd.',
      reportReply: 'Antwoord melden',
    },
    profileSettings: { removeImage: 'Afbeelding weg' },
    moderation: { blockedUsers: 'Geblokkeerd', noBlocked: 'Niemand geblokkeerd' },
  },
  id: {
    geohash: { queries3: 'semua g', queriesCurrent: 'semua post geo' },
    composer: {
      invalidGeohash: 'Geohash tidak valid.',
      editGeohashAria: 'Edit geohash',
      createInCell: 'Post baru di sel',
      createNew: 'Post baru',
      publishAria: 'Terbitkan',
    },
    relay: { unknown: 'tak dikenal' },
    moderation: { unblockedMsg: 'Blokir dicabut.', noBlocked: 'Tidak ada yang diblokir' },
  },
  uk: {
    geohash: { queries3: 'усі g', queriesCurrent: 'усі геопости' },
    composer: {
      invalidGeohash: 'Невірний geohash.',
      editGeohashAria: 'Редагувати geohash',
      createInCell: 'Новий пост у комірці',
      createNew: 'Новий пост',
      uploadFailed: 'Завантаження не вдалося.',
    },
    thread: { reportReply: 'Скарга на відповідь', userBlocked: 'Заблоковано.' },
    moderation: { unblockedMsg: 'Розблоковано.' },
    pwa: { reload: 'Оновити' },
  },
  bn: {
    geohash: { queries3: 'সব g', queriesCurrent: 'সব জিও পোস্ট' },
    composer: {
      invalidGeohash: 'অবৈধ geohash.',
      editGeohashAria: 'Geohash সম্পাদনা',
      createInCell: 'সেলে নতুন পোস্ট',
      createNew: 'নতুন পোস্ট',
    },
    thread: { userBlocked: 'ব্লক করা হয়েছে।' },
    moderation: { unblockedMsg: 'আনব্লক করা হয়েছে।', noBlocked: 'কেউ ব্লক নেই' },
    quotedPost: { noText: '(খালি)' },
  },
  th: {
    geohash: { queries3: 'g ทั้งหมด', queriesCurrent: 'โพสต์ที่มีตำแหน่ง' },
    composer: {
      invalidGeohash: 'Geohash ไม่ถูกต้อง',
      editGeohashAria: 'แก้ไข geohash',
      createInCell: 'โพสต์ใหม่ในเซลล์',
      createNew: 'โพสต์ใหม่',
    },
  },
  he: {
    geohash: { queries3: 'כל g', queriesCurrent: 'כל הפוסטים עם מיקום' },
    composer: {
      invalidGeohash: 'Geohash לא תקין.',
      editGeohashAria: 'ערוך geohash',
      createInCell: 'פוסט חדש בתא',
      createNew: 'פוסט חדש',
    },
  },
}

/** UI length trims + leftover English fixes per locale */
const TRIM_PATCHES = {
  de: {
    composer: {
      publish: 'Posten',
      publishing: 'Poste…',
      publishFailed: 'Posten fehlgeschlagen.',
      publishAria: 'Posten',
      mediaAria: 'Medien',
      srTitle: 'Neuer Post',
    },
    app: { publishFailed: 'Posten fehlgeschlagen.' },
    thread: {
      publishFailedFallback: 'Posten fehlgeschlagen.',
      deleteFailed: 'Löschen fehlgeschlagen.',
      blockUserAria: 'Blockieren',
      blockUserTitle: 'Blockieren',
      blockingFailed: 'Block fehlgeschlagen.',
      offlineBlock: 'Offline – Blockieren nicht möglich.',
    },
    profileSheet: { loadError: 'Posts nicht geladen.', loadingPosts: 'Lade Posts…' },
    feed: { tryAgain: 'Nochmal' },
    errorBoundary: { tryAgain: 'Nochmal' },
    settings: { title: 'Einstellungen' },
    keyMgmt: { importFailed: 'Import fehlgeschlagen.' },
  },
  fr: {
    composer: {
      srTitle: 'Nouveau post',
      publishAria: 'Publier',
      mediaAria: 'Ajouter média',
      publishFailed: 'Échec publication.',
      showMapTitle: 'Voir sur la carte',
      showMapAria: 'Carte {{cell}}',
    },
    feedArticle: { openPost: 'Ouvrir', deletedAria: 'Supprimé' },
    nav: { searchPlaceholder: 'Rechercher…' },
    thread: {
      deleteFailed: 'Échec suppression.',
      blockUserAria: 'Bloquer',
      blockUserTitle: 'Bloquer',
      reportRoot: 'Signaler le post',
      submitReport: 'Signaler',
      offlineBlock: 'Hors ligne — blocage impossible.',
    },
    profileSheet: {
      loadingPosts: 'Chargement…',
      loadError: 'Publications non chargées.',
      noPostsFromRelays: 'Aucune publication des relays.',
      message: 'Message',
    },
    profileSettings: { resetError: 'Échec réinitialisation.', reset: 'Réinit.' },
    moderation: { blocklist: 'Liste de blocage' },
    settings: { source: 'Source' },
  },
  es: {
    composer: { srTitle: 'Nuevo post', publishAria: 'Publicar' },
    profileSheet: {
      noPosts: 'Sin posts',
      loadError: 'Posts no cargados.',
      loadingPosts: 'Cargando…',
      offlineHint: 'Sin conexión: posts del perfil incompletos.',
    },
    feedArticle: { openPost: 'Abrir post', deletedAria: 'Post eliminado' },
    thread: {
      replyPlaceholder: 'Responder…',
      deleteFailed: 'Fallo al borrar.',
      blockUserAria: 'Bloquear',
      blockUserTitle: 'Bloquear',
      offlineBlock: 'Sin conexión.',
      reportRoot: 'Denunciar post',
    },
    moderation: { blocklist: 'Bloqueos' },
    nav: { searchPlaceholder: 'Buscar…' },
    relay: { title: 'Relays' },
    chat: { title: 'Chat' },
    errorBoundary: { errorLabel: 'Error:' },
  },
  it: {
    composer: { mediaAria: 'Aggiungi media', publishFailed: 'Pubblicazione fallita.' },
    thread: {
      deleteFailed: 'Eliminazione fallita.',
      publishFailedFallback: 'Pubblicazione fallita.',
      replyPlaceholder: 'Rispondi…',
      offline: 'Offline',
    },
    errorBoundary: { stack: 'Stack:' },
    chat: { title: 'Chat' },
    composer: { media: 'Media' },
    pwa: { title: 'Aggiornamento' },
    quotedPost: { noText: '(vuoto)' },
    relay: { test: 'Test' },
  },
  pt: {
    thread: {
      blockUserAria: 'Bloquear',
      blockUserTitle: 'Bloquear',
      replyPlaceholder: 'Responder…',
      deleteFailed: 'Falha ao apagar.',
      offlineBlock: 'Offline — bloqueio impossível.',
      userBlocked: 'Bloqueado.',
    },
    profileSheet: {
      loadError: 'Posts não carregados.',
      noPosts: 'Sem posts',
      loadingPosts: 'A carregar…',
    },
    moderation: {
      blocklist: 'Bloqueios',
      blockedUsers: 'Bloqueados',
      noBlocked: 'Ninguém bloqueado',
    },
    composer: { srTitle: 'Novo post' },
    feed: { tryAgain: 'Tentar' },
    errorBoundary: { tryAgain: 'Tentar', stack: 'Stack:' },
    nav: { searchPlaceholder: 'Pesquisar…' },
    feedArticle: { deletedAria: 'Eliminado' },
    relay: { title: 'Relays' },
    chat: { title: 'Chat' },
  },
  pl: {
    composer: {
      uploadFailed: 'Wysyłanie nieudane.',
      publishFailed: 'Publikacja nieudana.',
    },
    app: { publishFailed: 'Publikacja nieudana.' },
    thread: {
      publishFailedFallback: 'Publikacja nieudana.',
      deleteFailed: 'Usuwanie nieudane.',
      blockUserAria: 'Zablokuj',
      blockUserTitle: 'Zablokuj',
      userBlocked: 'Zablokowano.',
      blockingFailed: 'Blokada nieudana.',
    },
    moderation: { blocklist: 'Blokady', blockedUsers: 'Zablokowani' },
    composer: { media: 'Media' },
    relay: { test: 'Test' },
  },
  ru: {
    thread: {
      userBlocked: 'Заблокирован.',
      deleteFailed: 'Удаление не удалось.',
      blockUserAria: 'Заблокировать',
      blockUserTitle: 'Заблокировать',
    },
    moderation: { unblockedMsg: 'Разблокирован.' },
    composer: { mediaAria: 'Добавить медиа' },
  },
  tr: {
    moderation: { unblockedMsg: 'Engel kaldırıldı.', blockedUsers: 'Engellenenler' },
    thread: {
      blockUserAria: 'Engelle',
      blockUserTitle: 'Engelle',
      blockHeading: 'Engelle: {{label}}',
    },
    feedArticle: { loadOlder: 'Daha fazla' },
    composer: { srTitle: 'Yeni gönderi' },
  },
  hi: {
    thread: {
      blockUserAria: 'ब्लॉक',
      blockUserTitle: 'ब्लॉक',
      blocking: 'ब्लॉक…',
      blockHeading: '{{label}} ब्लॉक',
    },
    moderation: { unblockedMsg: 'अनब्लॉक किया.', noBlocked: 'कोई ब्लॉक नहीं' },
    composer: { editGeohashAria: 'Geohash संपादित' },
    relay: { testing: 'टेस्ट…' },
    composer: { publishing: 'पोस्ट हो रहा…' },
  },
  bn: {
    geohash: { queries3: 'সব g', queriesCurrent: 'সব জিও পোস্ট' },
    composer: {
      invalidGeohash: 'অবৈধ geohash.',
      editGeohashAria: 'Geohash সম্পাদনা',
      createInCell: 'সেলে নতুন পোস্ট',
      createNew: 'নতুন পোস্ট',
    },
    thread: { userBlocked: 'ব্লক করা হয়েছে।' },
    moderation: { unblockedMsg: 'আনব্লক করা হয়েছে।', noBlocked: 'কেউ ব্লক নেই' },
    quotedPost: { noText: '(খালি)' },
  },
  vi: {
    quotedPost: { noText: '(trống)' },
    errorBoundary: { stack: 'Stack:', componentStack: 'Component stack:' },
    thread: { blockUserAria: 'Chặn', blockUserTitle: 'Chặn' },
    composer: { srTitle: 'Bài mới' },
    composer: { media: 'Media' },
  },
  ar: {
    relay: { testing: 'اختبار…' },
    errorBoundary: { reload: 'إعادة تحميل' },
    thread: { reportRoot: 'بلاغ المنشور' },
  },
  fa: {
    root: { loading: 'بارگذاری…' },
    common: { loading: 'بارگذاری…' },
    thread: { blocking: 'مسدود…' },
  },
  ja: {
    geohash: { geoHashLabel: 'Geohash:', geoHashEmpty: 'Geohash: -' },
  },
  ko: {
    geohash: { geoHashLabel: 'Geohash:', geoHashEmpty: 'Geohash: -' },
  },
  'zh-CN': {
    geohash: { geoHashLabel: 'Geohash:', geoHashEmpty: 'Geohash: -' },
  },
}

const EN_PATCH = {
  composer: {
    createInCell: 'New post in cell',
    createNew: 'New post',
    invalidGeohash: 'Invalid geohash.',
    editGeohashAria: 'Edit geohash',
  },
  geohash: {
    queries3: 'all g tags',
    queriesCurrent: 'all geotagged posts',
  },
}

const NEW_LOCALE_FILES = ['nl', 'id', 'uk', 'zh-TW', 'bn', 'th', 'he']

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
}

function saveJson(name, obj) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

// 1. Patch en.json
saveJson('en.json', deepMerge(loadJson('en.json'), EN_PATCH))

// 2. Patch existing locale files
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
  const code = f.replace('.json', '')
  let j = loadJson(f)
  if (GEO_COMPOSER[code]) j = deepMerge(j, GEO_COMPOSER[code])
  if (TRIM_PATCHES[code]) j = deepMerge(j, TRIM_PATCHES[code])
  saveJson(f, j)
}

// 3. New locale files are maintained as full JSON (see src/locales/{nl,id,uk,zh-TW,bn,th,he}.json)
for (const code of NEW_LOCALE_FILES) {
  const file = `${code}.json`
  const p = path.join(dir, file)
  if (!fs.existsSync(p)) {
    console.warn('missing new locale file:', file)
    continue
  }
  let j = loadJson(file)
  if (GEO_COMPOSER[code]) j = deepMerge(j, GEO_COMPOSER[code])
  saveJson(file, j)
}

console.log('Locale sync done.')
