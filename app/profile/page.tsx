'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Camera, Check, Globe, LoaderCircle, MapPin, Save, UserRound, ImagePlus, Plus, X, Link as LinkIcon, ChevronDown } from 'lucide-react';

type Country = { name: string; cca2: string; flag: string };

export default function ProfilePage() {
  const { user, profile, setProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [countryFlag, setCountryFlag] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [countryList, setCountryList] = useState<Country[]>([]);
  const [countryMenu, setCountryMenu] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [cityMenu, setCityMenu] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [websites, setWebsites] = useState<string[]>([]);
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'avatar'|'cover'|null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [avatarX, setAvatarX] = useState(50);
  const [avatarY, setAvatarY] = useState(50);
  const [coverX, setCoverX] = useState(50);
  const [coverY, setCoverY] = useState(50);
  const [previewImage, setPreviewImage] = useState<{ src: string; label: string } | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setUsername(profile?.username ?? '');
    setBio(profile?.bio ?? '');
    setCity(profile?.city ?? '');
    setCityQuery(profile?.city ?? '');
    setCountry(profile?.country_name ?? '');
    setCountryQuery(profile?.country_name ?? '');
    setCountryCode(profile?.country_code ?? '');
    setCountryFlag(profile?.country_flag ?? '');
    setWebsites(profile?.websites?.length ? profile.websites : (profile?.website ? [profile.website] : []));
    setAvatarX(profile?.avatar_position_x ?? 50);
    setAvatarY(profile?.avatar_position_y ?? 50);
    setCoverX(profile?.cover_position_x ?? 50);
    setCoverY(profile?.cover_position_y ?? 50);
  }, [profile?.id, profile?.updated_at, profile?.username, profile?.websites?.join('|')]);

  useEffect(() => {
    let alive = true;
    fetch('/api/locations?type=countries').then(r => r.json()).then(data => { if (alive) setCountryList(Array.isArray(data.countries) ? data.countries : []); }).catch(() => { if (alive) setCountryList([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!country) { setCities([]); setCityMenu(false); return; }
    setLoadingCities(true);
    const timer = setTimeout(() => {
      fetch(`/api/locations?type=cities&country=${encodeURIComponent(country)}&q=${encodeURIComponent(cityQuery)}`)
        .then(r => r.json()).then(data => { if (alive) { setCities(Array.isArray(data.cities) ? data.cities : []); setCityMenu(true); } })
        .catch(() => { if (alive) setCities([]); })
        .finally(() => { if (alive) setLoadingCities(false); });
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [country, cityQuery]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.toLocaleLowerCase('fr').trim();
    return countryList.filter(c => !q || `${c.flag} ${c.name} ${c.cca2}`.toLocaleLowerCase('fr').includes(q)).slice(0, 9);
  }, [countryList, countryQuery]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!user) return;
    const supabase = createClient(); if (!supabase) return;
    setSaving(true); setError(''); setMessage('');
    const normalized = username.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,30}$/.test(normalized)) { setError('Le nom d’utilisateur doit contenir 3 à 30 lettres, chiffres ou tirets bas.'); setSaving(false); return; }
    const payload = {
      full_name: fullName.trim(), username: normalized, bio: bio.trim(), city: city.trim() || null,
      country_name: country || null, country_code: countryCode || null, country_flag: countryFlag || null,
      avatar_position_x: avatarX, avatar_position_y: avatarY, cover_position_x: coverX, cover_position_y: coverY,
      websites, website: websites[0] || null, updated_at: new Date().toISOString(),
    };
    const { data, error: saveError } = await supabase.from('profiles').update(payload).eq('id', user.id).select('*').single();
    if (saveError) setError(saveError.code === '23505' ? 'Ce nom d’utilisateur est déjà pris.' : saveError.message);
    else { setProfile(data); setMessage('Ton profil a bien été enregistré.'); }
    setSaving(false);
  }

  async function uploadProfileImage(file: File | undefined, kind: 'avatar'|'cover') {
    if (!file || !user) return;
    if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) { setError('Choisis une image JPG, PNG, WebP ou AVIF.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('L’image doit faire 5 Mo maximum.'); return; }
    const supabase = createClient(); if (!supabase) return;
    setUploading(kind); setError(''); setMessage('');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) setError(uploadError.message);
    else {
      const { data: urlData } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const column = kind === 'avatar' ? 'avatar_url' : 'cover_url';
      const { data, error: updateError } = await supabase.from('profiles').update({ [column]: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id).select('*').single();
      if (updateError) setError(updateError.message);
      else { setProfile(data); setMessage(kind === 'avatar' ? 'Photo de profil mise à jour.' : 'Photo de couverture mise à jour.'); }
    }
    setUploading(null);
  }

  function chooseCountry(item: Country) {
    setCountry(item.name); setCountryQuery(`${item.flag} ${item.name}`); setCountryCode(item.cca2); setCountryFlag(item.flag);
    setCity(''); setCityQuery(''); setCityMenu(false); setCountryMenu(false);
  }

  function addWebsite() {
    const value = websiteDraft.trim();
    if (!value) return;
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const parsed = new URL(normalized);
      if (!parsed.hostname.includes('.')) { setError('Entre une adresse de site web valide.'); return; }
      if (websites.some(w => w.toLowerCase() === parsed.href.toLowerCase())) { setError('Ce lien est déjà dans ton profil.'); return; }
      setWebsites(old => [...old, parsed.href].slice(0, 10)); setWebsiteDraft(''); setError('');
    } catch { setError('Entre une adresse de site web valide.'); }
  }

  return <AppShell><div className="content-column">
    <div className="page-heading"><div><div className="eyebrow">TON IDENTITÉ NUMÉRIQUE</div><h1>Mon <span>profil.</span></h1><p>Présente-toi à la communauté, à ta façon.</p></div><div className="heading-icon"><UserRound size={22}/></div></div>
    <section className="profile-hero card-surface"><div className="profile-cover" style={profile?.cover_url ? { backgroundImage: `linear-gradient(90deg,rgba(8,22,48,.28),rgba(8,22,48,.08)),url("${profile.cover_url}")`, backgroundSize: 'cover', backgroundPosition: `${coverX}% ${coverY}%` } : undefined}><div className="cover-orb orb-a"/><div className="cover-orb orb-b"/><span className="cover-brand">Jémor Space</span>{profile?.cover_url ? <button type="button" className="cover-preview-button" onClick={() => setPreviewImage({src: profile.cover_url!, label: 'Photo de couverture'})}>Voir la couverture</button> : null}<label className="cover-upload-button" title="Changer la couverture"><Camera size={16}/><span>{uploading === 'cover' ? 'Envoi…' : 'Changer la couverture'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => void uploadProfileImage(e.target.files?.[0], 'cover')} disabled={!!uploading}/></label></div><div className="profile-hero-content"><div className="avatar-upload-wrap"><button type="button" className="avatar-preview-button" onClick={() => profile?.avatar_url && setPreviewImage({src: profile.avatar_url, label: 'Photo de profil'})} aria-label="Agrandir la photo de profil" disabled={!profile?.avatar_url}><Avatar src={profile?.avatar_url} name={profile?.full_name || user?.email} size="xl" objectPosition={`${avatarX}% ${avatarY}%`}/></button><label className="avatar-upload-button" title="Changer la photo"><Camera size={16}/><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => void uploadProfileImage(e.target.files?.[0], 'avatar')} disabled={!!uploading}/></label></div><div className="profile-hero-name"><h2>{profile?.full_name || 'Ton nom complet'}</h2><span>@{profile?.username || 'nom_utilisateur'}</span></div><div className="profile-hero-badge"><Check size={14}/> Membre Jémor</div></div><p className="profile-bio-preview">{profile?.bio || 'Quelques mots sur toi aideront ta communauté à mieux te connaître.'}</p>{profile?.country_name ? <div className="profile-location-summary">{profile.country_flag} {profile.country_name}{profile.city ? ` · ${profile.city}` : ''}</div> : null}</section>
    <section className="card-surface form-card"><div className="form-card-heading"><div><div className="eyebrow">INFORMATIONS PERSONNELLES</div><h2>Personnaliser mon profil</h2></div><div className="subtle-icon"><Save size={18}/></div></div><form className="profile-form" onSubmit={saveProfile}>
      <div className="profile-image-adjustments">
        <div><strong>Photo de profil</strong><label className="image-position-control">Position horizontale<input type="range" min="0" max="100" value={avatarX} onChange={e => setAvatarX(Number(e.target.value))}/></label><label className="image-position-control">Position verticale<input type="range" min="0" max="100" value={avatarY} onChange={e => setAvatarY(Number(e.target.value))}/></label></div>
        <div><strong>Photo de couverture</strong><label className="image-position-control">Position horizontale<input type="range" min="0" max="100" value={coverX} onChange={e => setCoverX(Number(e.target.value))}/></label><label className="image-position-control">Position verticale<input type="range" min="0" max="100" value={coverY} onChange={e => setCoverY(Number(e.target.value))}/></label></div>
      </div>
      <div className="form-grid"><label>Nom complet<input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Ton nom et prénom" maxLength={100} required/></label><label>Nom d’utilisateur<div className="field-with-prefix"><span>@</span><input value={username} onChange={e => setUsername(e.target.value)} placeholder="nom_utilisateur" maxLength={30} required/></div><small>3 à 30 caractères : lettres, chiffres et _</small></label></div>
      <label>À propos de toi<textarea value={bio} onChange={e => setBio(e.target.value)} maxLength={500} rows={4} placeholder="Ce qui te passionne, ce qui te définit…"/><small>{bio.length}/500 caractères</small></label>
      <div className="profile-location-grid"><label><span className="label-with-icon"><Globe size={15}/> Pays</span><div className="country-autocomplete"><input autoComplete="off" value={countryQuery} onFocus={() => setCountryMenu(true)} onChange={e => { setCountryQuery(e.target.value); setCountryMenu(true); if (!e.target.value) { setCountry(''); setCountryCode(''); setCountryFlag(''); setCity(''); setCityQuery(''); } }} placeholder="Cherche un pays et son drapeau…"/><button type="button" className="location-dropdown-toggle" aria-label="Ouvrir la liste des pays" onClick={() => setCountryMenu(value => !value)}><ChevronDown size={15}/></button>{countryMenu && filteredCountries.length > 0 ? <div className="location-suggestions">{filteredCountries.map(item => <button type="button" key={item.cca2} onClick={() => chooseCountry(item)}><span className="country-flag">{item.flag}</span><span>{item.name}</span><small>{item.cca2}</small></button>)}</div> : null}</div></label><label><span className="label-with-icon"><MapPin size={15}/> Ville</span><div className="country-autocomplete"><input autoComplete="off" disabled={!country} value={cityQuery} onFocus={() => country && setCityMenu(true)} onChange={e => { setCityQuery(e.target.value); setCity(e.target.value); setCityMenu(true); }} placeholder={country ? 'Recherche une ville…' : 'Choisis d’abord un pays'}/>{loadingCities ? <LoaderCircle size={15} className="spin"/> : <button type="button" className="location-dropdown-toggle" aria-label="Ouvrir la liste des villes" disabled={!country} onClick={() => setCityMenu(value => !value)}><ChevronDown size={15}/></button>}{cityMenu && country && cities.length > 0 ? <div className="location-suggestions city-suggestions">{cities.map(item => <button type="button" key={item} onClick={() => { setCity(item); setCityQuery(item); setCityMenu(false); }}><MapPin size={14}/><span>{item}</span></button>)}</div> : null}</div><small>Tu peux aussi saisir la ville manuellement.</small></label></div>
      <div className="websites-editor"><div className="section-line"><div><h3>Sites web et liens</h3><small>Ajoute jusqu’à 10 liens à partager sur ton profil.</small></div><LinkIcon size={18}/></div><div className="website-add-row"><input type="url" value={websiteDraft} onChange={e => setWebsiteDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addWebsite(); } }} placeholder="https://monsite.com"/><button type="button" className="button button-quiet" disabled={!websiteDraft.trim() || websites.length >= 10} onClick={addWebsite}><Plus size={15}/> Ajouter</button></div>{websites.length ? <div className="website-list">{websites.map((site,i) => <div key={site} className="website-chip"><Globe size={14}/><a href={site} target="_blank" rel="noreferrer">{site}</a><button type="button" aria-label="Retirer le lien" onClick={() => setWebsites(old => old.filter((_,j) => j !== i))}><X size={14}/></button></div>)}</div> : <p className="muted small-copy">Aucun lien ajouté pour le moment.</p>}</div>
      {error ? <div className="form-message error-message">{error}</div> : null}{message ? <div className="form-message success-message">{message}</div> : null}<div className="profile-form-footer"><span className="muted small-copy">{uploading ? 'Envoi de l’image…' : 'Tes informations sont enregistrées dans ton compte.'}</span><button className="button button-primary" type="submit" disabled={saving || !!uploading}>{saving ? <LoaderCircle size={16} className="spin"/> : <Save size={16}/>} Enregistrer</button></div>
    </form></section>
    {previewImage ? <div className="modal-backdrop profile-image-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPreviewImage(null); }}><section className="profile-image-modal" role="dialog" aria-modal="true" aria-label={previewImage.label}><button type="button" className="profile-image-close" onClick={() => setPreviewImage(null)} aria-label="Fermer"><X size={21}/></button><img src={previewImage.src} alt={previewImage.label}/><strong>{previewImage.label}</strong></section></div> : null}
  </div></AppShell>;
}
