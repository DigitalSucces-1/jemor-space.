import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 86400;

type Country = { name: string; cca2: string; flag: string };
const cityCache = new Map<string, string[]>();
const fallbackCities: Record<string, string[]> = {
  'benin': ['Cotonou','Porto-Novo','Parakou','Abomey-Calavi','Djougou','Bohicon','Kandi','Natitingou','Ouidah','Lokossa','Savalou','Malanville'],
  'cote d’ivoire': ['Abidjan','Bouaké','Daloa','Yamoussoukro','Korhogo','San-Pédro','Man','Gagnoa','Divo','Abengourou'],
  'cote d ivoire': ['Abidjan','Bouaké','Daloa','Yamoussoukro','Korhogo','San-Pédro','Man','Gagnoa','Divo','Abengourou'],
  'senegal': ['Dakar','Touba','Thiès','Rufisque','Kaolack','Ziguinchor','Saint-Louis','Mbour','Diourbel'],
  'france': ['Paris','Marseille','Lyon','Toulouse','Nice','Nantes','Montpellier','Strasbourg','Bordeaux','Lille','Rennes','Reims','Le Havre','Saint-Étienne','Toulon','Grenoble'],
  'united states': ['New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego','Dallas','San Jose','Austin','Jacksonville'],
  'united states of america': ['New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego','Dallas','San Jose','Austin','Jacksonville'],
  'nigeria': ['Lagos','Kano','Ibadan','Abuja','Port Harcourt','Benin City','Kaduna','Enugu','Aba'],
  'ghana': ['Accra','Kumasi','Tamale','Takoradi','Cape Coast','Tema'],
  'togo': ['Lomé','Sokodé','Kara','Kpalimé','Atakpamé','Bassar'],
  'cameroon': ['Douala','Yaoundé','Garoua','Bamenda','Maroua','Bafoussam'],
};

async function fetchCountries(): Promise<Country[]> {
  try {
    const res = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,flag', { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error('country list unavailable');
    const rows = await res.json() as Array<{ name?: { common?: string }; cca2?: string; flag?: string }>;
    return rows.filter((x) => x.cca2 && x.name?.common).map((x) => ({ name: x.name!.common!, cca2: x.cca2!, flag: x.flag || flagFromCode(x.cca2!) })).sort((a,b) => a.name.localeCompare(b.name, 'fr'));
  } catch {
    return [
      { name:'Bénin',cca2:'BJ',flag:'🇧🇯' },{ name:'Côte d’Ivoire',cca2:'CI',flag:'🇨🇮' },{ name:'France',cca2:'FR',flag:'🇫🇷' },
      { name:'Ghana',cca2:'GH',flag:'🇬🇭' },{ name:'Nigeria',cca2:'NG',flag:'🇳🇬' },{ name:'Sénégal',cca2:'SN',flag:'🇸🇳' },
      { name:'Togo',cca2:'TG',flag:'🇹🇬' },{ name:'États-Unis',cca2:'US',flag:'🇺🇸' },{ name:'Canada',cca2:'CA',flag:'🇨🇦' },
    ];
  }
}
function flagFromCode(code: string) { return code.toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(c.charCodeAt(0) + 127397)); }

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') || 'countries';
  if (type === 'countries') return NextResponse.json({ countries: await fetchCountries() }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
  if (type !== 'cities') return NextResponse.json({ error: 'type doit être countries ou cities' }, { status: 400 });
  const country = (req.nextUrl.searchParams.get('country') || '').trim();
  const query = (req.nextUrl.searchParams.get('q') || '').trim().toLocaleLowerCase('fr');
  if (!country) return NextResponse.json({ cities: [] });
  const key = country.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let cities = cityCache.get(key);
  if (!cities) {
    try {
      const res = await fetch('https://countriesnow.space/api/v0.1/countries/cities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country }), signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error('cities API unavailable');
      const json = await res.json() as { error?: boolean; data?: string[] };
      if (json.error || !Array.isArray(json.data)) throw new Error('cities data unavailable');
      cities = [...new Set(json.data.filter(Boolean))].sort((a,b) => a.localeCompare(b, 'fr'));
      cityCache.set(key, cities);
    } catch {
      cities = fallbackCities[key] || [];
      cityCache.set(key, cities);
    }
  }
  const filtered = query ? cities.filter((city) => city.toLocaleLowerCase('fr').includes(query)).slice(0, 100) : cities.slice(0, 100);
  return NextResponse.json({ cities: filtered, total: cities.length, fallback: !cities.length }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
