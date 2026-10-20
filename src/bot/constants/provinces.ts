import { IranianProvinceInfo } from '../../types';

export const IRANIAN_PROVINCES: IranianProvinceInfo[] = [
  { id: 'tehran', nameEn: 'Tehran', nameFa: 'تهران' },
  { id: 'isfahan', nameEn: 'Isfahan', nameFa: 'اصفهان' },
  { id: 'fars', nameEn: 'Fars', nameFa: 'فارس' },
  { id: 'khorasan_razavi', nameEn: 'Khorasan Razavi', nameFa: 'خراسان رضوی' },
  { id: 'east_azerbaijan', nameEn: 'East Azerbaijan', nameFa: 'آذربایجان شرقی' },
  { id: 'west_azerbaijan', nameEn: 'West Azerbaijan', nameFa: 'آذربایجان غربی' },
  { id: 'khuzestan', nameEn: 'Khuzestan', nameFa: 'خوزستان' },
  { id: 'mazandaran', nameEn: 'Mazandaran', nameFa: 'مازندران' },
  { id: 'gilan', nameEn: 'Gilan', nameFa: 'گیلان' },
  { id: 'kerman', nameEn: 'Kerman', nameFa: 'کرمان' },
  { id: 'kermanshah', nameEn: 'Kermanshah', nameFa: 'کرمانشاه' },
  { id: 'alborz', nameEn: 'Alborz', nameFa: 'البرز' },
  { id: 'qom', nameEn: 'Qom', nameFa: 'قم' },
  { id: 'yazd', nameEn: 'Yazd', nameFa: 'یزد' },
  { id: 'hamadan', nameEn: 'Hamadan', nameFa: 'همدان' },
  { id: 'golestan', nameEn: 'Golestan', nameFa: 'گلستان' },
  { id: 'hormozgan', nameEn: 'Hormozgan', nameFa: 'هرمزگان' },
  { id: 'lorestan', nameEn: 'Lorestan', nameFa: 'لرستان' },
  { id: 'kurdistan', nameEn: 'Kurdistan', nameFa: 'کردستان' },
  { id: 'markazi', nameEn: 'Markazi', nameFa: 'مرکزی' },
  { id: 'ardabil', nameEn: 'Ardabil', nameFa: 'اردبیل' },
  { id: 'qazvin', nameEn: 'Qazvin', nameFa: 'قزوین' },
  { id: 'bushehr', nameEn: 'Bushehr', nameFa: 'بوشهر' },
  { id: 'zanjan', nameEn: 'Zanjan', nameFa: 'زنجان' },
  { id: 'ilam', nameEn: 'Ilam', nameFa: 'ایلام' },
  { id: 'chaharmahal', nameEn: 'Chaharmahal & Bakhtiari', nameFa: 'چهارمحال و بختیاری' },
  { id: 'semnan', nameEn: 'Semnan', nameFa: 'سمنان' },
  { id: 'north_khorasan', nameEn: 'North Khorasan', nameFa: 'خراسان شمالی' },
  { id: 'south_khorasan', nameEn: 'South Khorasan', nameFa: 'خراسان جنوبی' },
  { id: 'kohgiluyeh', nameEn: 'Kohgiluyeh & Boyer-Ahmad', nameFa: 'کهگیلویه و بویراحمد' },
  { id: 'sistan', nameEn: 'Sistan & Baluchestan', nameFa: 'سیستان و بلوچستان' },
];

/**
 * Creates inline keyboard button matrix for province selection (paged or grouped)
 */
export function getProvinceKeyboard(page = 0, pageSize = 8) {
  const totalPages = Math.ceil(IRANIAN_PROVINCES.length / pageSize);
  const start = page * pageSize;
  const currentChunk = IRANIAN_PROVINCES.slice(start, start + pageSize);

  const rows: Array<Array<{ text: string; callback_data: string }>> = [];

  // 2 buttons per row
  for (let i = 0; i < currentChunk.length; i += 2) {
    const pair = currentChunk.slice(i, i + 2).map((prov) => ({
      text: `${prov.nameEn} (${prov.nameFa})`,
      callback_data: `prov_select:${prov.nameEn}`,
    }));
    rows.push(pair);
  }

  // Navigation row
  const navRow: Array<{ text: string; callback_data: string }> = [];
  if (page > 0) {
    navRow.push({ text: '⬅️ Previous', callback_data: `prov_page:${page - 1}` });
  }
  navRow.push({ text: `📍 ${page + 1}/${totalPages}`, callback_data: 'prov_page:noop' });
  if (page < totalPages - 1) {
    navRow.push({ text: 'Next ➡️', callback_data: `prov_page:${page + 1}` });
  }
  rows.push(navRow);

  return rows;
}
