"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { btn } from "@/components/ui/button";
import { restoreProgramVersion } from "@/app/actions";
import {
  VERSION_SOURCE_LABELS,
  type SnapshotDay,
  type SnapshotDiff,
  type VersionSource,
} from "@/lib/program-versions";

export type VersionRow = {
  id: string;
  versionNumber: number;
  source: string;
  note: string | null;
  createdAt: string; // ISO
};

type VersionDetail = {
  versionNumber: number;
  source: string;
  note: string | null;
  createdAt: string;
  name: string;
  days: SnapshotDay[];
  diff: SnapshotDiff | null;
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function sourceLabel(source: string) {
  return VERSION_SOURCE_LABELS[source as VersionSource] ?? "Modification";
}

/**
 * Historique des versions du programme : consulter le plan tel qu'il était à
 * une date, et y revenir. La restauration réutilise les identifiants d'origine
 * (voir restoreProgramVersion), donc elle ne coupe pas le fil de la
 * progression — et elle est elle-même versionnée.
 */
export default function ProgramVersions({
  programId,
  versions,
}: {
  programId: string;
  versions: VersionRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = versions[0];

  async function openDetail(versionId: string) {
    setLoadingId(versionId);
    setError(null);
    try {
      const res = await fetch(
        `/api/programs/${programId}/versions/${versionId}`
      );
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      setError("Impossible de charger cette version.");
    } finally {
      setLoadingId(null);
    }
  }

  async function restore(version: VersionRow) {
    if (
      !confirm(
        `Revenir à la version ${version.versionNumber} du ${formatDate(version.createdAt)} ? Tes séances déjà enregistrées ne changent pas.`
      )
    ) {
      return;
    }
    setRestoringId(version.id);
    setError(null);
    try {
      await restoreProgramVersion(version.id);
      setDetail(null);
      setOpen(false);
      router.refresh();
    } catch {
      setError("La restauration a échoué.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-[14px] px-1 py-2 text-left"
      >
        <History size={17} className="shrink-0 text-muted-2" />
        <span className="min-w-0 flex-1 text-sm font-semibold">
          Versions du plan
          <span className="ml-1.5 font-mono text-xs font-normal text-muted">
            {versions.length}
          </span>
        </span>
        {current && (
          <span className="shrink-0 font-mono text-xs text-muted">
            v{current.versionNumber} · {formatDate(current.createdAt)}
          </span>
        )}
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </button>

      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
          setDetail(null);
        }}
      >
        {detail ? (
          <div className="max-h-[70vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Retour à la liste"
                className="text-muted-2 hover:text-ink"
              >
                <ArrowLeft size={18} />
              </button>
              <p className="text-base font-extrabold">
                Version {detail.versionNumber}
              </p>
              <span className="font-mono text-xs text-muted">
                {formatDate(detail.createdAt)}
              </span>
            </div>

            {detail.diff && (
              <div className="mt-3 rounded-[14px] bg-surface-2 p-3">
                <p className="overline-label text-accent">
                  Changements par rapport à la version précédente
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 text-xs text-muted-2">
                  {detail.diff.exercisesAdded.map((n) => (
                    <li key={`a${n}`}>+ {n}</li>
                  ))}
                  {detail.diff.exercisesRemoved.map((n) => (
                    <li key={`r${n}`} className="text-muted">
                      − {n}
                    </li>
                  ))}
                  {detail.diff.exercisesChanged.map((c) => (
                    <li key={`c${c.name}`}>
                      {c.name} : {c.changes.join(" · ")}
                    </li>
                  ))}
                  {detail.diff.exercisesAdded.length === 0 &&
                    detail.diff.exercisesRemoved.length === 0 &&
                    detail.diff.exercisesChanged.length === 0 && (
                      <li className="text-muted">
                        Aucun changement d&apos;exercice.
                      </li>
                    )}
                </ul>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-3">
              {detail.days.map((day) => (
                <div key={day.id}>
                  <p className="text-sm font-bold">
                    {day.name}
                    {day.focus && (
                      <span className="ml-1.5 text-xs font-normal text-muted">
                        {day.focus}
                      </span>
                    )}
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {day.exercises.map((ex) => (
                      <li
                        key={ex.id}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-muted-2">
                          {ex.name}
                        </span>
                        <span className="shrink-0 font-mono text-muted">
                          {ex.sets} × {ex.reps} · {ex.restSeconds} s
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-danger">{error}</p>}

            {current && detail.versionNumber !== current.versionNumber && (
              <button
                type="button"
                className={btn("outline", "md", "mt-4 w-full")}
                disabled={restoringId !== null}
                onClick={() => {
                  const row = versions.find(
                    (v) => v.versionNumber === detail.versionNumber
                  );
                  if (row) restore(row);
                }}
              >
                {restoringId ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RotateCcw size={16} />
                )}
                Revenir à cette version
              </button>
            )}
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto">
            <p className="text-base font-extrabold">Versions du plan</p>
            <p className="mt-1 text-xs text-muted-2">
              Chaque modification du programme est enregistrée. Tes séances
              gardent le plan qui était en vigueur le jour où tu les as faites :
              revenir en arrière ne touche pas à ton historique.
            </p>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <ul className="mt-3 flex flex-col">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(v.id)}
                    disabled={loadingId !== null}
                    className="flex w-full items-center gap-3 border-b border-card-border py-2.5 text-left last:border-b-0"
                  >
                    <span className="w-8 shrink-0 font-mono text-sm font-bold text-accent">
                      v{v.versionNumber}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {v.note || sourceLabel(v.source)}
                      </span>
                      <span className="block font-mono text-[11.5px] text-muted">
                        {formatDate(v.createdAt)}
                        {v.note && ` · ${sourceLabel(v.source)}`}
                        {current && v.id === current.id && " · en vigueur"}
                      </span>
                    </span>
                    {loadingId === v.id ? (
                      <Loader2 size={15} className="shrink-0 animate-spin text-muted" />
                    ) : (
                      <ChevronRight size={15} className="shrink-0 text-muted" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
