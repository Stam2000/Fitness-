"use client";

import MediaThumb from "@/components/ui/MediaThumb";

export type NextUpInfo = {
  overline: string;
  imageUrl: string | null;
  title: string;
  targetLine: string;
  lastLine?: string | null;
};

/** Carte « ENSUITE · … » affichée sous les timers plein écran. */
export default function NextUpCard({ nextUp }: { nextUp: NextUpInfo }) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <MediaThumb
        url={nextUp.imageUrl}
        alt=""
        className="h-[46px] w-[64px] shrink-0 rounded-[10px]"
        iconSize={20}
      />
      <div className="min-w-0 flex-1">
        <p className="overline-label text-[11px] text-muted">{nextUp.overline}</p>
        <p className="mt-0.5 truncate text-[15px] font-bold">{nextUp.title}</p>
        <p className="mt-0.5 font-mono text-[13px] text-muted-2">
          {nextUp.targetLine}
        </p>
        {nextUp.lastLine && (
          <p className="font-mono text-[13px] text-muted-2">{nextUp.lastLine}</p>
        )}
      </div>
    </div>
  );
}
