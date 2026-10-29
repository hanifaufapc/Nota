import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  Archive,
  Building2,
  CheckCircle2,
  PencilLine,
  Plus,
  Tags,
  X,
} from 'lucide-react';
import type { MosqueProfileInput } from '../../data/repositories/notaRepository';
import {
  DEFAULT_FUND_OPERASIONAL_ID,
  type Fund,
} from '../../domain/mosque';
import {
  type AppSettings,
  type Category,
  type CategoryInput,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_MOSQUE_ADDRESS_LENGTH,
  MAX_MOSQUE_NAME_LENGTH,
  MAX_OFFICER_NAME_LENGTH,
  MOSQUE_DEFAULT_CATEGORIES,
  type TransactionType,
} from '../../domain/transaction';

interface MosqueSettingsSectionProps {
  settings: AppSettings;
  categories: readonly Category[];
  funds: readonly Fund[];
  onSaveMosqueProfile: (profile: MosqueProfileInput) => Promise<void>;
  onAddCategory: (input: CategoryInput) => Promise<void>;
  onUpdateCategoryName: (categoryId: string, newName: string) => Promise<void>;
  onArchiveCategory: (categoryId: string) => Promise<void>;
}

const MOSQUE_DEFAULT_ID_SET = new Set(
  MOSQUE_DEFAULT_CATEGORIES.map((c) => c.id),
);

export function MosqueSettingsSection({
  settings,
  categories,
  funds,
  onSaveMosqueProfile,
  onAddCategory,
  onUpdateCategoryName,
  onArchiveCategory,
}: MosqueSettingsSectionProps) {
  const mosqueNameInputId = useId();
  const mosqueAddressInputId = useId();
  const chairpersonInputId = useId();
  const treasurerInputId = useId();
  const profileErrorId = useId();

  const catNameInputId = useId();
  const catDefaultFundSelectId = useId();
  const catErrorId = useId();

  // Mosque Profile Form State
  const [mosqueName, setMosqueName] = useState(
    () => settings.mosqueName ?? '',
  );
  const [mosqueAddress, setMosqueAddress] = useState(
    () => settings.mosqueAddress ?? '',
  );
  const [chairpersonName, setChairpersonName] = useState(
    () => settings.chairpersonName ?? '',
  );
  const [treasurerName, setTreasurerName] = useState(
    () => settings.treasurerName ?? '',
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const prevSettingsRef = useRef({
    mosqueName: settings.mosqueName,
    mosqueAddress: settings.mosqueAddress,
    chairpersonName: settings.chairpersonName,
    treasurerName: settings.treasurerName,
  });

  useEffect(() => {
    const prev = prevSettingsRef.current;
    if (
      prev.mosqueName !== settings.mosqueName ||
      prev.mosqueAddress !== settings.mosqueAddress ||
      prev.chairpersonName !== settings.chairpersonName ||
      prev.treasurerName !== settings.treasurerName
    ) {
      prevSettingsRef.current = {
        mosqueName: settings.mosqueName,
        mosqueAddress: settings.mosqueAddress,
        chairpersonName: settings.chairpersonName,
        treasurerName: settings.treasurerName,
      };
      setMosqueName(settings.mosqueName ?? '');
      setMosqueAddress(settings.mosqueAddress ?? '');
      setChairpersonName(settings.chairpersonName ?? '');
      setTreasurerName(settings.treasurerName ?? '');
    }
  }, [
    settings.mosqueName,
    settings.mosqueAddress,
    settings.chairpersonName,
    settings.treasurerName,
  ]);

  // Category Management State
  const [catTab, setCatTab] = useState<TransactionType>('income');
  const [isCatFormOpen, setIsCatFormOpen] = useState(false);
  const [newCatType, setNewCatType] = useState<TransactionType>('income');
  const [newCatName, setNewCatName] = useState('');
  const [newCatFundId, setNewCatFundId] = useState<string>(
    DEFAULT_FUND_OPERASIONAL_ID,
  );
  const [catFormError, setCatFormError] = useState<string | null>(null);
  const [isSavingCat, setIsSavingCat] = useState(false);

  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const fundNameMap = useMemo(
    () => new Map(funds.map((f) => [f.id, f.name])),
    [funds],
  );

  // Show Mosque default categories + any custom user categories
  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (cat) =>
          cat.type === catTab &&
          (!cat.isDefault || MOSQUE_DEFAULT_ID_SET.has(cat.id)),
      ),
    [categories, catTab],
  );

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingProfile) {
      return;
    }
    setProfileError(null);
    setProfileSuccess(null);

    if (!mosqueName.trim()) {
      setProfileError('Nama masjid wajib diisi.');
      return;
    }

    setIsSavingProfile(true);
    try {
      await onSaveMosqueProfile({
        mosqueName: mosqueName.trim(),
        mosqueAddress: mosqueAddress.trim(),
        chairpersonName: chairpersonName.trim(),
        treasurerName: treasurerName.trim(),
      });
      setProfileSuccess(
        'Profil dan pengurus masjid berhasil disimpan ke penyimpanan lokal.',
      );
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan profil masjid.',
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  function openAddCategoryForm() {
    setNewCatType(catTab);
    setNewCatName('');
    setNewCatFundId(DEFAULT_FUND_OPERASIONAL_ID);
    setCatFormError(null);
    setIsCatFormOpen(true);
  }

  async function handleAddCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingCat) {
      return;
    }
    setCatFormError(null);

    const trimmedName = newCatName.trim();
    if (!trimmedName) {
      setCatFormError('Nama kategori masjid wajib diisi.');
      return;
    }

    const slug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    const id = `cat-${newCatType === 'income' ? 'inc' : 'exp'}-${slug || 'custom'}-${Date.now().toString(36)}`;

    setIsSavingCat(true);
    try {
      await onAddCategory({
        id,
        name: trimmedName,
        type: newCatType,
        defaultFundId: newCatFundId || DEFAULT_FUND_OPERASIONAL_ID,
        color: newCatType === 'income' ? 'emerald' : 'expense',
        isDefault: false,
      });
      setCatTab(newCatType);
      setIsCatFormOpen(false);
      setNewCatName('');
    } catch (error) {
      setCatFormError(
        error instanceof Error
          ? error.message
          : 'Gagal menambahkan kategori baru.',
      );
    } finally {
      setIsSavingCat(false);
    }
  }

  function startRenameCategory(cat: Category) {
    setRenamingCategoryId(cat.id);
    setRenameValue(cat.name);
    setRenameError(null);
  }

  async function handleRenameSubmit(categoryId: string) {
    if (isRenaming) {
      return;
    }
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Nama kategori tidak boleh kosong.');
      return;
    }
    setIsRenaming(true);
    setRenameError(null);
    try {
      await onUpdateCategoryName(categoryId, trimmed);
      setRenamingCategoryId(null);
    } catch (error) {
      setRenameError(
        error instanceof Error
          ? error.message
          : 'Gagal mengubah nama kategori.',
      );
    } finally {
      setIsRenaming(false);
    }
  }

  async function handleArchive(categoryId: string) {
    if (archivingId) {
      return;
    }
    setArchivingId(categoryId);
    try {
      await onArchiveCategory(categoryId);
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Panel 1: Profil & Pengurus Masjid */}
      <section
        aria-label="Profil dan pengurus masjid"
        className="rounded-hero bg-nota-surface p-6 sm:p-8 border border-nota-border/70 space-y-5"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-nota-border bg-nota-soft-green text-nota-emerald">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-nota-ink">
              Profil & Pengurus Masjid (DKM / Takmir)
            </h2>
            <p className="text-xs sm:text-sm text-nota-muted max-w-2xl">
              Data identitas masjid dan nama pengurus digunakan pada header
              aplikasi serta lembar pengesahan laporan pertanggungjawaban
              jamaah.
            </p>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} noValidate className="space-y-4">
          {profileError ? (
            <div
              id={profileErrorId}
              role="alert"
              className="flex items-center gap-2 rounded-badge border border-nota-expense/30 bg-nota-expense-soft px-3.5 py-2.5 text-xs text-nota-expense"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{profileError}</span>
            </div>
          ) : null}

          {profileSuccess ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-badge border border-nota-emerald/30 bg-nota-soft-green px-3.5 py-2.5 text-xs font-medium text-nota-emerald"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{profileSuccess}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={mosqueNameInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Nama Masjid / Musholla
              </label>
              <input
                id={mosqueNameInputId}
                name="mosqueName"
                type="text"
                maxLength={MAX_MOSQUE_NAME_LENGTH}
                value={mosqueName}
                onChange={(e) => {
                  setMosqueName(e.target.value);
                  setProfileError(null);
                  setProfileSuccess(null);
                }}
                placeholder="Contoh: Masjid Jami Al-Hikmah"
                aria-invalid={profileError ? 'true' : 'false'}
                aria-describedby={profileError ? profileErrorId : undefined}
                className="w-full rounded-badge border border-nota-border bg-nota-bg px-3.5 py-2 text-sm text-nota-ink"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={mosqueAddressInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Alamat Lengkap Masjid
              </label>
              <input
                id={mosqueAddressInputId}
                name="mosqueAddress"
                type="text"
                maxLength={MAX_MOSQUE_ADDRESS_LENGTH}
                autoComplete="street-address"
                value={mosqueAddress}
                onChange={(e) => {
                  setMosqueAddress(e.target.value);
                  setProfileError(null);
                  setProfileSuccess(null);
                }}
                placeholder="Contoh: Jl. Melati No. 12, Kec. Sukmajaya"
                className="w-full rounded-badge border border-nota-border bg-nota-bg px-3.5 py-2 text-sm text-nota-ink"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={chairpersonInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Nama Ketua DKM / Takmir
              </label>
              <input
                id={chairpersonInputId}
                name="chairpersonName"
                type="text"
                maxLength={MAX_OFFICER_NAME_LENGTH}
                autoComplete="name"
                value={chairpersonName}
                onChange={(e) => {
                  setChairpersonName(e.target.value);
                  setProfileError(null);
                  setProfileSuccess(null);
                }}
                placeholder="Contoh: H. Ahmad Fauzi"
                className="w-full rounded-badge border border-nota-border bg-nota-bg px-3.5 py-2 text-sm text-nota-ink"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={treasurerInputId}
                className="block text-xs font-medium text-nota-ink"
              >
                Nama Bendahara Masjid
              </label>
              <input
                id={treasurerInputId}
                name="treasurerName"
                type="text"
                maxLength={MAX_OFFICER_NAME_LENGTH}
                autoComplete="name"
                value={treasurerName}
                onChange={(e) => {
                  setTreasurerName(e.target.value);
                  setProfileError(null);
                  setProfileSuccess(null);
                }}
                placeholder="Contoh: Ust. Ridwan Kamil"
                className="w-full rounded-badge border border-nota-border bg-nota-bg px-3.5 py-2 text-sm text-nota-ink"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSavingProfile}
              className="inline-flex items-center gap-1.5 rounded-control bg-nota-emerald px-5 py-2 text-xs sm:text-sm font-medium text-white hover:bg-nota-emerald-hover transition-colors cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {isSavingProfile ? 'Menyimpan...' : 'Simpan Profil Masjid'}
            </button>
          </div>
        </form>
      </section>

      {/* Panel 2: Manajemen Kategori Masjid */}
      <section
        aria-label="Manajemen kategori masjid"
        className="rounded-hero bg-nota-surface p-6 sm:p-8 border border-nota-border/70 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-nota-border bg-nota-soft-green text-nota-emerald">
              <Tags className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-nota-ink">
                Manajemen Kategori Masjid
              </h2>
              <p className="text-xs sm:text-sm text-nota-muted max-w-2xl">
                Kelola kategori penerimaan dan pengeluaran kas masjid beserta
                dana amanah bawaannya. Kategori yang diarsipkan tetap terbaca
                pada transaksi lama.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openAddCategoryForm}
            className="inline-flex items-center gap-1.5 rounded-control border border-nota-border bg-nota-bg px-4 py-2 text-xs sm:text-sm font-medium text-nota-ink hover:bg-nota-soft-green/50 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4 text-nota-emerald" aria-hidden="true" />
            Tambah Kategori Masjid
          </button>
        </div>

        {/* Add Category Form */}
        {isCatFormOpen ? (
          <form
            onSubmit={handleAddCategorySubmit}
            noValidate
            aria-label="Formulir tambah kategori masjid"
            className="rounded-panel border border-nota-border bg-nota-bg/70 p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-nota-ink">
                Tambah Kategori Baru
              </h3>
              <button
                type="button"
                onClick={() => setIsCatFormOpen(false)}
                aria-label="Tutup formulir kategori"
                className="inline-flex h-7 w-7 items-center justify-center rounded-control text-nota-muted hover:bg-nota-surface"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {catFormError ? (
              <div
                id={catErrorId}
                role="alert"
                className="rounded-badge border border-nota-expense/30 bg-nota-expense-soft px-3 py-2 text-xs text-nota-expense"
              >
                {catFormError}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <fieldset className="space-y-1">
                <legend className="block text-xs font-medium text-nota-ink">
                  Jenis Kategori
                </legend>
                <div className="flex items-center gap-2">
                  <label className="flex flex-1 items-center gap-1.5 rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="newCategoryType"
                      value="income"
                      checked={newCatType === 'income'}
                      onChange={() => setNewCatType('income')}
                      className="accent-nota-emerald"
                    />
                    <span>Penerimaan</span>
                  </label>
                  <label className="flex flex-1 items-center gap-1.5 rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="newCategoryType"
                      value="expense"
                      checked={newCatType === 'expense'}
                      onChange={() => setNewCatType('expense')}
                      className="accent-nota-emerald"
                    />
                    <span>Pengeluaran</span>
                  </label>
                </div>
              </fieldset>

              <div className="space-y-1">
                <label
                  htmlFor={catNameInputId}
                  className="block text-xs font-medium text-nota-ink"
                >
                  Nama Kategori Baru
                </label>
                <input
                  id={catNameInputId}
                  type="text"
                  maxLength={MAX_CATEGORY_NAME_LENGTH}
                  value={newCatName}
                  onChange={(e) => {
                    setNewCatName(e.target.value);
                    setCatFormError(null);
                  }}
                  placeholder="Contoh: Wakaf Al-Quran & Buku"
                  aria-invalid={catFormError ? 'true' : 'false'}
                  aria-describedby={catFormError ? catErrorId : undefined}
                  className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-xs text-nota-ink"
                  required
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={catDefaultFundSelectId}
                  className="block text-xs font-medium text-nota-ink"
                >
                  Dana Amanah Bawaan
                </label>
                <select
                  id={catDefaultFundSelectId}
                  value={newCatFundId}
                  onChange={(e) => setNewCatFundId(e.target.value)}
                  className="w-full rounded-badge border border-nota-border bg-nota-surface px-3 py-2 text-xs text-nota-ink"
                >
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCatFormOpen(false)}
                className="rounded-control border border-nota-border bg-nota-surface px-3.5 py-1.5 text-xs font-medium text-nota-ink cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSavingCat}
                className="rounded-control bg-nota-emerald px-4 py-1.5 text-xs font-medium text-white cursor-pointer"
              >
                Simpan Kategori
              </button>
            </div>
          </form>
        ) : null}

        {/* Filter Type Tabs */}
        <div
          role="group"
          aria-label="Filter jenis kategori masjid"
          className="inline-flex rounded-control border border-nota-border bg-nota-bg p-1"
        >
          <button
            type="button"
            onClick={() => setCatTab('income')}
            aria-pressed={catTab === 'income'}
            className={`rounded-control px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              catTab === 'income'
                ? 'bg-nota-emerald text-white'
                : 'text-nota-muted hover:text-nota-ink'
            }`}
          >
            Kategori Penerimaan
          </button>
          <button
            type="button"
            onClick={() => setCatTab('expense')}
            aria-pressed={catTab === 'expense'}
            className={`rounded-control px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              catTab === 'expense'
                ? 'bg-nota-emerald text-white'
                : 'text-nota-muted hover:text-nota-ink'
            }`}
          >
            Kategori Pengeluaran
          </button>
        </div>

        {renameError ? (
          <div
            role="alert"
            className="rounded-badge border border-nota-expense/30 bg-nota-expense-soft px-3 py-2 text-xs text-nota-expense"
          >
            {renameError}
          </div>
        ) : null}

        <div className="divide-y divide-nota-border/70 rounded-panel border border-nota-border bg-nota-bg/40">
          {visibleCategories.map((cat) => {
            const isRenamingRow = renamingCategoryId === cat.id;
            const isArchived = Boolean(cat.archivedAt);
            const defaultFundLabel = cat.defaultFundId
              ? fundNameMap.get(cat.defaultFundId) ?? 'Dana Operasional Umum'
              : 'Dana Operasional Umum';

            return (
              <div
                key={cat.id}
                data-testid={`settings-category-row-${cat.id}`}
                className="flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  {isRenamingRow ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        aria-label={`Nama baru untuk ${cat.name}`}
                        maxLength={MAX_CATEGORY_NAME_LENGTH}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="rounded-badge border border-nota-border bg-nota-surface px-2.5 py-1 text-xs font-medium text-nota-ink"
                      />
                      <button
                        type="button"
                        disabled={isRenaming}
                        onClick={() => void handleRenameSubmit(cat.id)}
                        className="rounded-control bg-nota-emerald px-3 py-1 font-medium text-white cursor-pointer"
                      >
                        Simpan Nama
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingCategoryId(null)}
                        className="rounded-control border border-nota-border bg-nota-surface px-3 py-1 font-medium text-nota-ink cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-semibold ${
                          isArchived
                            ? 'line-through text-nota-muted'
                            : 'text-nota-ink'
                        }`}
                      >
                        {cat.name}
                      </span>
                      <span className="rounded-control border border-nota-border bg-nota-surface px-2 py-0.5 text-[10px] font-medium text-nota-muted">
                        Dana bawaan: {defaultFundLabel}
                      </span>
                      {isArchived ? (
                        <span className="rounded-control bg-nota-border/60 px-2 py-0.5 text-[10px] font-medium text-nota-muted">
                          Diarsipkan
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                {!isRenamingRow ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startRenameCategory(cat)}
                      aria-label={`Ubah nama kategori ${cat.name}`}
                      className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 font-medium text-nota-ink hover:bg-nota-soft-green/50 cursor-pointer"
                    >
                      <PencilLine className="h-3 w-3 text-nota-emerald" />
                      Ubah Nama
                    </button>
                    {!isArchived ? (
                      <button
                        type="button"
                        disabled={archivingId === cat.id}
                        onClick={() => void handleArchive(cat.id)}
                        aria-label={`Arsipkan kategori ${cat.name}`}
                        className="inline-flex items-center gap-1 rounded-control border border-nota-border bg-nota-surface px-2.5 py-1 font-medium text-nota-muted hover:text-nota-expense cursor-pointer"
                      >
                        <Archive className="h-3 w-3" />
                        Arsipkan
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
