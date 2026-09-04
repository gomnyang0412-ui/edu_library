'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Archive, BookOpen, ChevronRight, Clock3, Download, FileText, Folder,
  Heart, Home, Image as ImageIcon, LoaderCircle, LogIn, LogOut, Menu,
  Pencil, Plus, RotateCcw, Search, Settings, Sparkles, Star, Trash2,
  Upload, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { hasSupabaseConfig, STORAGE_BUCKET, supabase } from '@/lib/supabase';

type Category = { id: number; name: string; sort_order: number };
type DocumentItem = {
  id: string; title: string; description: string | null; storage_path: string;
  original_filename: string; mime_type: string; file_size: number; tags: string[];
  is_favorite: boolean; created_at: string; updated_at: string; deleted_at: string | null;
  categories: Category[];
};
type RawDocument = Omit<DocumentItem, 'categories'> & {
  document_categories?: Array<{ categories: Category | Category[] | null }>;
};

const suggestedTags = ['상담', '수행평가', '세특', '학부모', '2026'];
const defaultCategories = ['담임', '평가', '생기부', '입시·진로', '학교양식', '기타'];
const allowedExtensions = ['pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png'];
const fallbackMimes: Record<string, string> = {
  pdf: 'application/pdf', hwp: 'application/x-hwp', hwpx: 'application/vnd.hancom.hwpx',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};

function readableSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function dateText(date: string) {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date)).replace(/\. /g, '.').replace(/\.$/, '');
}
function fileKind(item: DocumentItem) {
  const ext = item.original_filename.split('.').pop()?.toUpperCase();
  return ext || item.mime_type.split('/').pop()?.toUpperCase() || 'FILE';
}
function normalizeDocument(row: RawDocument): DocumentItem {
  const categories = (row.document_categories ?? []).flatMap((link) => {
    if (!link.categories) return [];
    return Array.isArray(link.categories) ? link.categories : [link.categories];
  });
  const { document_categories: _links, ...document } = row;
  return { ...document, categories };
}

export default function HomePage() {
  const [active, setActive] = useState('전체 자료');
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [searched, setSearched] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<DocumentItem | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagText, setTagText] = useState('');
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const flash = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 3200);
  }, []);

  const checkAdmin = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setIsAdmin(false); return false; }
    const { data, error } = await supabase.rpc('is_admin');
    const allowed = !error && data === true;
    setIsAdmin(allowed);
    return allowed;
  }, []);

  const loadData = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return; }
    setLoading(true);
    const [{ data: categoryData, error: categoryError }, { data: documentData, error: documentError }] = await Promise.all([
      supabase.from('categories').select('id,name,sort_order').order('sort_order'),
      supabase.from('documents').select('*,document_categories(category_id,categories(id,name,sort_order))').order('created_at', { ascending: false }),
    ]);
    if (categoryError || documentError) {
      flash('Supabase 연결을 확인해 주세요. 설정 안내서의 Data API 단계를 확인하면 돼요.');
    } else {
      setCategories((categoryData ?? []) as Category[]);
      setDocuments(((documentData ?? []) as unknown as RawDocument[]).map(normalizeDocument));
    }
    setLoading(false);
  }, [flash]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void checkAdmin().then(loadData); }, 0);
    const { data } = supabase.auth.onAuthStateChange(() => { void checkAdmin(); });
    return () => { window.clearTimeout(initialLoad); data.subscription.unsubscribe(); };
  }, [checkAdmin, loadData]);

  useEffect(() => {
    type ToolContext = { registerTool: (tool: {
      name: string; title: string; description: string; inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: { query?: string; tag?: string }) => object;
    }, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'search_work_documents', title: '업무 자료 검색',
      description: '파일명, 설명 또는 태그로 업무 자료를 찾아 화면에 보여줍니다.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, tag: { type: 'string' } }, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input) {
        const nextQuery = typeof input.query === 'string' ? input.query.trim() : '';
        const nextTag = typeof input.tag === 'string' ? input.tag.replace(/^#/, '').trim() : '';
        setQuery(nextQuery); setSelectedTag(nextTag); setActive('전체 자료'); setSearched(true);
        return { query: nextQuery, tag: nextTag };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return documents.filter((doc) => {
      const isTrash = active === '휴지통';
      if (isTrash ? !doc.deleted_at : !!doc.deleted_at) return false;
      const activeMatch = active === '전체 자료' || active === '최근 자료' || active === '휴지통'
        || (active === '즐겨찾기' && doc.is_favorite)
        || (active === 'Inbox' && doc.categories.length === 0)
        || doc.categories.some((category) => category.name === active);
      const tagMatch = !selectedTag || doc.tags.includes(selectedTag);
      const textMatch = !needle || [doc.title, doc.description ?? '', doc.original_filename, ...doc.tags].join(' ').toLowerCase().includes(needle);
      return activeMatch && tagMatch && textMatch;
    });
  }, [active, documents, query, selectedTag]);

  const showResults = searched || active !== '전체 자료' || !!selectedTag;
  const requireAdmin = (action: () => void) => {
    if (isAdmin) action(); else setLoginOpen(true);
  };
  const toggleCategory = (id: number) => setCategoryIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const tags = tagText.split(',').map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);

  const selectUploadFile = (selected: File | null) => {
    if (!selected) return;
    const extension = selected.name.split('.').pop()?.toLowerCase() ?? '';
    if (!allowedExtensions.includes(extension)) { flash('지원하지 않는 파일 형식이에요.'); return; }
    if (selected.size > 50 * 1024 * 1024) { flash('파일은 최대 50MB까지 올릴 수 있어요.'); return; }
    setFile(selected);
    if (!title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
  };

  const resetUpload = () => {
    setFile(null); setTitle(''); setDescription(''); setTagText(''); setCategoryIds([]);
  };

  const uploadDocument = async () => {
    if (!file || !title.trim()) { flash('파일과 제목을 확인해 주세요.'); return; }
    setWorking(true);
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
    const storagePath = `${crypto.randomUUID()}/${safeName}`;
    const mimeType = fallbackMimes[extension] || file.type || 'application/octet-stream';
    const fileBody = await file.arrayBuffer();
    const upload = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, fileBody, { contentType: mimeType, upsert: false });
    if (upload.error) {
      flash(`업로드하지 못했어요: ${upload.error.message}`);
    } else {
      const created = await supabase.rpc('create_document', {
        p_title: title.trim(), p_description: description.trim(), p_storage_path: storagePath,
        p_original_filename: file.name, p_mime_type: mimeType, p_file_size: file.size,
        p_tags: tags, p_category_ids: categoryIds,
      });
      if (created.error) {
        flash(`자료 정보를 저장하지 못했어요: ${created.error.message}`);
      } else {
        flash('자료를 추가했어요.'); setUploadOpen(false); resetUpload(); await loadData();
      }
    }
    setWorking(false);
  };

  const login = async () => {
    if (!email || !password) { flash('이메일과 비밀번호를 입력해 주세요.'); return; }
    setWorking(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !(await checkAdmin())) {
      await supabase.auth.signOut();
      flash(error ? '이메일이나 비밀번호를 확인해 주세요.' : '관리자로 등록된 계정이 아니에요.');
    } else {
      flash('관리자로 로그인했어요.'); setLoginOpen(false); setEmail(''); setPassword(''); await loadData();
    }
    setWorking(false);
  };

  const logout = async () => {
    await supabase.auth.signOut(); setIsAdmin(false); setActive('전체 자료'); flash('로그아웃했어요.'); await loadData();
  };

  const toggleFavorite = async (doc: DocumentItem) => {
    const { error } = await supabase.from('documents').update({ is_favorite: !doc.is_favorite }).eq('id', doc.id);
    if (error) flash('즐겨찾기를 바꾸지 못했어요.'); else await loadData();
  };

  const softDelete = async (doc: DocumentItem) => {
    if (!window.confirm('이 자료를 휴지통으로 이동할까요?')) return;
    const { error } = await supabase.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', doc.id);
    if (error) flash('휴지통으로 이동하지 못했어요.'); else { setDetail(null); flash('휴지통으로 이동했어요.'); await loadData(); }
  };

  const restore = async (doc: DocumentItem) => {
    const { error } = await supabase.from('documents').update({ deleted_at: null }).eq('id', doc.id);
    if (error) flash('복원하지 못했어요.'); else { flash('자료를 복원했어요.'); await loadData(); }
  };

  const permanentDelete = async (doc: DocumentItem) => {
    if (!window.confirm('파일과 자료 정보를 영구적으로 삭제할까요? 이 작업은 되돌릴 수 없어요.')) return;
    setWorking(true);
    const storage = await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
    if (storage.error) flash('파일을 삭제하지 못해 중단했어요.');
    else {
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) flash('자료 정보를 삭제하지 못했어요.'); else { flash('영구 삭제했어요.'); setDetail(null); await loadData(); }
    }
    setWorking(false);
  };

  const openEdit = (doc: DocumentItem) => {
    setDetail(doc); setTitle(doc.title); setDescription(doc.description ?? '');
    setTagText(doc.tags.join(', ')); setCategoryIds(doc.categories.map((category) => category.id));
    setFile(null); setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!detail || !title.trim()) return;
    setWorking(true);
    let storagePath = detail.storage_path;
    let originalFilename = detail.original_filename;
    let mimeType = detail.mime_type;
    let fileSize = detail.file_size;
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const nextPath = `${detail.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')}`;
      const nextMimeType = fallbackMimes[extension] || file.type || 'application/octet-stream';
      const fileBody = await file.arrayBuffer();
      const upload = await supabase.storage.from(STORAGE_BUCKET).upload(nextPath, fileBody, { contentType: nextMimeType });
      if (upload.error) { flash('새 파일을 올리지 못했어요.'); setWorking(false); return; }
      storagePath = nextPath; originalFilename = file.name; mimeType = nextMimeType; fileSize = file.size;
    }
    const updated = await supabase.from('documents').update({
      title: title.trim(), description: description.trim() || null, tags,
      storage_path: storagePath, original_filename: originalFilename, mime_type: mimeType, file_size: fileSize,
    }).eq('id', detail.id);
    if (updated.error) {
      flash('수정 내용을 저장하지 못했어요.');
    } else {
      await supabase.from('document_categories').delete().eq('document_id', detail.id);
      if (categoryIds.length) await supabase.from('document_categories').insert(categoryIds.map((category_id) => ({ document_id: detail.id, category_id })));
      if (file) await supabase.storage.from(STORAGE_BUCKET).remove([detail.storage_path]);
      flash('수정 내용을 저장했어요.'); setEditOpen(false); setDetail(null); resetUpload(); await loadData();
    }
    setWorking(false);
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const { error } = await supabase.from('categories').insert({ name: newCategory.trim(), sort_order: categories.length + 1 });
    if (error) flash('카테고리를 추가하지 못했어요. 같은 이름이 있는지 확인해 주세요.');
    else { setNewCategory(''); flash('카테고리를 추가했어요.'); await loadData(); }
  };

  const renameCategory = async (category: Category) => {
    const name = window.prompt('새 카테고리 이름을 입력해 주세요.', category.name)?.trim();
    if (!name || name === category.name) return;
    const { error } = await supabase.from('categories').update({ name }).eq('id', category.id);
    if (error) flash('이름을 바꾸지 못했어요.'); else { flash('이름을 바꿨어요.'); await loadData(); }
  };

  const deleteCategory = async (category: Category) => {
    const count = documents.filter((doc) => doc.categories.some((item) => item.id === category.id)).length;
    if (!window.confirm(`'${category.name}' 카테고리에 연결된 자료가 ${count}개 있어요. 카테고리만 삭제하고 자료는 유지할까요?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', category.id);
    if (error) flash('카테고리를 삭제하지 못했어요.'); else { setActive('전체 자료'); flash('카테고리만 삭제했어요.'); await loadData(); }
  };

  const download = (doc: DocumentItem) => {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(doc.storage_path, { download: doc.original_filename });
    window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
  };

  const selectTag = (tag: string) => { setSelectedTag(tag); setSearched(true); };
  const navigation = [
    { label: '전체 자료', icon: Home }, { label: '최근 자료', icon: Clock3 },
    { label: '즐겨찾기', icon: Star }, { label: 'Inbox', icon: Archive },
    ...(isAdmin ? [{ label: '휴지통', icon: Trash2 }] : []),
  ];
  const visibleCategories = categories.length ? categories : defaultCategories.map((name, index) => ({ id: -(index + 1), name, sort_order: index + 1 }));

  return (
    <div className="app-shell">
      {message && <output className="toast-message">{message}</output>}
      <aside className="sidebar">
        <button className="brand brand-button" onClick={() => { setActive('전체 자료'); setSearched(false); }}><span className="brand-mark"><BookOpen /></span><span className="brand-copy"><span>흥덕 업무함</span></span></button>
        <nav className="side-nav" aria-label="자료 보기">{navigation.map(({ label, icon: Icon }) => <button key={label} className={active === label ? 'active' : ''} onClick={() => { setActive(label); setSearched(true); }}><Icon />{label}</button>)}</nav>
        <div className="side-section-label">카테고리</div>
        <nav className="side-nav categories" aria-label="카테고리">{visibleCategories.map((category) => <button key={category.id} className={active === category.name ? 'active' : ''} onClick={() => { setActive(category.name); setSearched(true); }}><Folder />{category.name}</button>)}</nav>
        <div className="sidebar-footer">
          <button className="category-settings" onClick={() => requireAdmin(() => setManageOpen(true))}><Settings /> 카테고리 관리</button>
          {isAdmin && <button className="category-settings logout-button" onClick={logout}><LogOut /> 로그아웃</button>}
          <div className="creator-credit"><span>기획·제작</span><strong>흥덕고등학교 신은수 교사</strong></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="mobile-header"><button className="brand brand-button" onClick={() => { setActive('전체 자료'); setSearched(false); }}><span className="brand-mark"><BookOpen /></span><span className="brand-copy"><span>흥덕 업무함</span><small>신은수 교사 기획·제작</small></span></button><button className="icon-button" aria-label="메뉴 열기" onClick={() => setCategoryOpen(true)}><Menu /></button></header>
        <div className={showResults ? 'content results-mode' : 'content'}>
          <section className="search-section">
            {!showResults && <div className="eyebrow"><Sparkles /> 필요한 자료를 빠르게 찾아요</div>}
            <h1>{showResults ? active : <>무엇을<br className="mobile-only" /> 찾고 있나요?</>}</h1>
            {!showResults && <p className="intro">파일명이나 설명, 태그를 입력해 보세요.</p>}
            <form className="search-box" onSubmit={(event) => { event.preventDefault(); setSearched(true); }}><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명, 설명, 태그로 검색" aria-label="자료 검색" />{query && <button type="button" className="clear-search" onClick={() => setQuery('')} aria-label="검색어 지우기"><X /></button>}<Button type="submit" className="search-submit">검색</Button></form>
            {!showResults && <div className="popular-tags" aria-label="추천 태그">{suggestedTags.map((tag) => <button key={tag} onClick={() => selectTag(tag)}>#{tag}</button>)}</div>}
            {showResults && selectedTag && <div className="filter-row"><button className="filter-chip" onClick={() => setSelectedTag('')}>#{selectedTag}<X /></button></div>}
          </section>

          {showResults && <section className="results" aria-live="polite">
            <div className="results-head"><p><strong>{results.length}</strong>개의 자료를 찾았어요</p>{active !== '휴지통' && <button onClick={() => setUploadOpen(true)}><Plus /> 자료 추가</button>}</div>
            <div className="document-list">
              {loading && <div className="empty-state"><LoaderCircle className="spin" /><h2>자료를 불러오고 있어요</h2></div>}
              {!loading && results.map((doc) => <article className="document-card" key={doc.id}>
                <button className="favorite" aria-label="즐겨찾기 변경" onClick={() => requireAdmin(() => void toggleFavorite(doc))}><Heart className={doc.is_favorite ? 'filled' : ''} /></button>
                <div className={`file-icon ${doc.mime_type.startsWith('image/') ? 'png' : fileKind(doc).toLowerCase()}`}>{doc.mime_type.startsWith('image/') ? <ImageIcon /> : <FileText />}</div>
                <div className="document-body"><button className="document-title" onClick={() => setDetail(doc)}>{doc.title}</button><p>{doc.description || doc.original_filename}</p><div className="tag-row">{doc.tags.map((tag) => <button key={tag} onClick={() => selectTag(tag)}>#{tag}</button>)}</div><div className="file-meta">{fileKind(doc)} · {readableSize(doc.file_size)} · {dateText(doc.created_at)}</div></div>
                <div className="card-actions">{doc.deleted_at ? <><Button variant="secondary" onClick={() => void restore(doc)}><RotateCcw /> 복원</Button><Button variant="destructive" onClick={() => void permanentDelete(doc)}>영구삭제</Button></> : <><Button variant="secondary" onClick={() => download(doc)}><Download /> 다운로드</Button><Button variant="ghost" onClick={() => setDetail(doc)}>자세히 보기 <ChevronRight /></Button></>}</div>
              </article>)}
              {!loading && results.length === 0 && <div className="empty-state"><Search /><h2>{active === '휴지통' ? '휴지통이 비어 있어요' : '조건에 맞는 자료가 없어요'}</h2><p>{active === '휴지통' ? '삭제한 자료가 여기에 표시돼요.' : '검색어나 필터를 바꿔보세요.'}</p></div>}
            </div>
          </section>}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="모바일 메뉴"><button onClick={() => { setActive('전체 자료'); setSearched(false); }} className={active === '전체 자료' ? 'active' : ''}><Home />홈</button><button onClick={() => { setActive('최근 자료'); setSearched(true); }} className={active === '최근 자료' ? 'active' : ''}><Clock3 />최근</button><button className="add-mobile" onClick={() => setUploadOpen(true)} aria-label="자료 추가"><Plus /></button><button onClick={() => { setActive('즐겨찾기'); setSearched(true); }} className={active === '즐겨찾기' ? 'active' : ''}><Star />즐겨찾기</button><button onClick={() => setCategoryOpen(true)}><Folder />카테고리</button></nav>

      <Dialog disablePointerDismissal open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) resetUpload(); }}><DialogContent className="upload-dialog"><DialogHeader><DialogTitle>새 자료를 추가해요</DialogTitle><DialogDescription>PDF, 문서, 프레젠테이션, 이미지 파일을 올릴 수 있어요.</DialogDescription></DialogHeader>
        <label className="drop-zone"><Upload /><strong>{file ? file.name : '파일을 선택해 주세요'}</strong><span>{file ? readableSize(file.size) : '또는 이곳에 끌어다 놓으세요 · 최대 50MB'}</span><input type="file" accept=".pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png" onChange={(event) => selectUploadFile(event.target.files?.[0] ?? null)} /></label>
        <div className="field-label"><label htmlFor="upload-title">제목</label><Input id="upload-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="파일을 고르면 제목이 자동으로 들어가요" /></div>
        <div className="field-label">카테고리<div className="choice-row">{categories.map((item) => <button type="button" className={categoryIds.includes(item.id) ? 'selected' : ''} key={item.id} onClick={() => toggleCategory(item.id)}>{item.name}</button>)}</div></div>
        <div className="field-label"><label htmlFor="upload-description">짧은 설명</label><Input id="upload-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="나중에 알아보기 쉽게 적어 주세요" /></div>
        <div className="field-label"><label htmlFor="upload-tags">태그</label><Input id="upload-tags" value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="상담, 학부모, 2026처럼 쉼표로 나눠요" /></div>
        <Button className="primary-large" disabled={working} onClick={() => void uploadDocument()}>{working ? <LoaderCircle className="spin" /> : null}자료 추가하기</Button>
      </DialogContent></Dialog>

      <Dialog disablePointerDismissal open={loginOpen} onOpenChange={setLoginOpen}><DialogContent className="login-dialog"><div className="login-icon"><LogIn /></div><DialogHeader><DialogTitle>관리자 로그인이 필요해요</DialogTitle><DialogDescription>자료 수정·삭제와 카테고리 관리는 관리자만 할 수 있어요.</DialogDescription></DialogHeader>
        <div className="field-label"><label htmlFor="admin-email">이메일</label><Input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teacher@school.kr" /></div><div className="field-label"><label htmlFor="admin-password">비밀번호</label><Input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호를 입력해 주세요" /></div>
        <Button className="primary-large" disabled={working} onClick={() => void login()}>{working ? <LoaderCircle className="spin" /> : null}로그인</Button>
      </DialogContent></Dialog>

      <Dialog disablePointerDismissal open={editOpen} onOpenChange={setEditOpen}><DialogContent className="upload-dialog"><DialogHeader><DialogTitle>자료를 수정해요</DialogTitle><DialogDescription>자료 정보나 실제 파일을 바꿀 수 있어요.</DialogDescription></DialogHeader>
        <label className="drop-zone compact"><Upload /><strong>{file ? file.name : `현재 파일: ${detail?.original_filename ?? ''}`}</strong><span>눌러서 새 파일로 교체할 수 있어요</span><input type="file" accept=".pdf,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png" onChange={(event) => selectUploadFile(event.target.files?.[0] ?? null)} /></label>
        <div className="field-label"><label htmlFor="edit-title">제목</label><Input id="edit-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="field-label">카테고리<div className="choice-row">{categories.map((item) => <button type="button" className={categoryIds.includes(item.id) ? 'selected' : ''} key={item.id} onClick={() => toggleCategory(item.id)}>{item.name}</button>)}</div></div>
        <div className="field-label"><label htmlFor="edit-description">짧은 설명</label><Input id="edit-description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        <div className="field-label"><label htmlFor="edit-tags">태그</label><Input id="edit-tags" value={tagText} onChange={(event) => setTagText(event.target.value)} /></div>
        <Button className="primary-large" disabled={working} onClick={() => void saveEdit()}>수정 내용 저장하기</Button>
      </DialogContent></Dialog>

      <Dialog disablePointerDismissal open={manageOpen} onOpenChange={setManageOpen}><DialogContent className="upload-dialog category-dialog"><DialogHeader><DialogTitle>카테고리를 관리해요</DialogTitle><DialogDescription>이름을 바꾸거나 삭제해도 자료 파일은 그대로 유지돼요.</DialogDescription></DialogHeader>
        <div className="add-category"><Input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="새 카테고리 이름" /><Button onClick={() => void addCategory()}><Plus />추가</Button></div>
        <div className="manage-list">{categories.map((category) => <div key={category.id}><span><Folder />{category.name}</span><div><Button variant="ghost" size="icon" aria-label="이름 변경" onClick={() => void renameCategory(category)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="삭제" onClick={() => void deleteCategory(category)}><Trash2 /></Button></div></div>)}</div>
      </DialogContent></Dialog>

      <Sheet open={categoryOpen} onOpenChange={setCategoryOpen}><SheetContent side="bottom" className="category-sheet"><SheetHeader><SheetTitle>카테고리</SheetTitle><SheetDescription>찾고 싶은 업무 영역을 골라 주세요.</SheetDescription></SheetHeader><div className="sheet-categories">{visibleCategories.map((category) => <button key={category.id} onClick={() => { setActive(category.name); setSearched(true); setCategoryOpen(false); }}><Folder />{category.name}<ChevronRight /></button>)}</div><button className="sheet-settings" onClick={() => { setCategoryOpen(false); requireAdmin(() => setManageOpen(true)); }}><Settings /> 카테고리 관리</button>{isAdmin && <button className="sheet-settings" onClick={() => void logout()}><LogOut /> 로그아웃</button>}</SheetContent></Sheet>

      <Sheet open={!!detail} onOpenChange={(open) => !open && setDetail(null)}><SheetContent side="right" className="detail-sheet">{detail && <><SheetHeader><div className={`file-icon large ${detail.mime_type.startsWith('image/') ? 'png' : fileKind(detail).toLowerCase()}`}>{detail.mime_type.startsWith('image/') ? <ImageIcon /> : <FileText />}</div><SheetTitle>{detail.title}</SheetTitle><SheetDescription>{detail.description || detail.original_filename}</SheetDescription></SheetHeader><div className="detail-content"><div className="tag-row">{detail.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="detail-preview">{detail.mime_type.startsWith('image/') ? <Image unoptimized width={800} height={600} src={supabase.storage.from(STORAGE_BUCKET).getPublicUrl(detail.storage_path).data.publicUrl} alt={detail.title} /> : detail.mime_type === 'application/pdf' ? <iframe title={detail.title} src={supabase.storage.from(STORAGE_BUCKET).getPublicUrl(detail.storage_path).data.publicUrl} /> : <><FileText /><p>이 파일 형식은 웹 미리보기를 지원하지 않아요.</p></>}</div><dl><div><dt>파일명</dt><dd>{detail.original_filename}</dd></div><div><dt>파일 크기</dt><dd>{readableSize(detail.file_size)}</dd></div><div><dt>등록일</dt><dd>{dateText(detail.created_at)}</dd></div></dl><Button className="primary-large" onClick={() => download(detail)}><Download />다운로드</Button>{isAdmin && !detail.deleted_at && <><Button variant="secondary" className="primary-large" onClick={() => openEdit(detail)}><Pencil />자료 수정</Button><Button variant="destructive" className="primary-large" onClick={() => void softDelete(detail)}><Trash2 />휴지통으로 이동</Button></>}</div></>}</SheetContent></Sheet>
    </div>
  );
}
