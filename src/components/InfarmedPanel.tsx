"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { formatIsoDate } from "@/lib/format";
import { useMessages } from "@/lib/i18n";
import type { InfarmedMatch } from "@/lib/infarmed/provider";
import { searchInfarmed, selectMatch, type InfarmedSearchResult } from "@/lib/infarmed/search";
import { INFOMED_SEARCH_URL, isOfficialInfarmedUrl, parseInfomedUrl } from "@/lib/infarmed/urls";
import type { MedicationInput } from "@/lib/medications";
import { Button, ExternalLink, Field, Notice, TextInput } from "./ui";

function MatchCard({ match, onSelect }: { match: InfarmedMatch; onSelect: () => void }) {
  const { m, locale } = useMessages();
  const rows: [string, string | undefined][] = [
    [m.infarmed.substance, match.activeSubstance],
    [m.infarmed.form, match.pharmaceuticalForm],
    [m.infarmed.strength, match.strength],
    [m.infarmed.status, match.authorisationStatus],
    [m.infarmed.holder, match.holder],
    [m.scan.fields.ean, match.ean],
  ];
  return (
    <li className="rounded-2xl border-2 border-line bg-white p-4">
      <p className="text-xl font-bold">{match.name}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
      </dl>
      <p className="mt-2 text-sm text-muted">
        {match.origin === "user-copied" ? m.infarmed.copiedByUser : m.infarmed.fromProvider}
        {match.retrievedAt ? ` · ${m.infarmed.retrievedOn(formatIsoDate(match.retrievedAt, locale))}` : ""}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {match.recordUrl ? <ExternalLink href={match.recordUrl}>{m.infarmed.recordLink}</ExternalLink> : null}
        {match.leafletUrl ? <ExternalLink href={match.leafletUrl}>{m.infarmed.leafletLink}</ExternalLink> : null}
        <Button block onClick={onSelect}>
          {m.infarmed.select}
        </Button>
      </div>
    </li>
  );
}

type LinkForm = {
  url: string;
  name: string;
  activeSubstance: string;
  pharmaceuticalForm: string;
  strength: string;
  authorisationStatus: string;
  holder: string;
  leafletUrl: string;
  spcUrl: string;
};

export function InfarmedPanel({
  input,
  initialQuery,
  autoSearch,
  onApply,
}: {
  input: MedicationInput;
  initialQuery: string;
  autoSearch?: boolean;
  onApply: (next: MedicationInput) => void;
}) {
  const { m } = useMessages();
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InfarmedSearchResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [link, setLink] = useState<LinkForm>({
    url: "",
    name: input.name,
    activeSubstance: input.activeSubstance ?? "",
    pharmaceuticalForm: input.pharmaceuticalForm ?? "",
    strength: input.dosage,
    authorisationStatus: "",
    holder: "",
    leafletUrl: "",
    spcUrl: "",
  });
  const ran = useRef(false);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResult(await searchInfarmed(q, { ean: input.ean }));
    } catch {
      setResult({ query: q, cached: [], remote: [], remoteStatus: "error" });
    } finally {
      setBusy(false);
    }
  }, [input.ean]);

  useEffect(() => {
    if (autoSearch && initialQuery && !ran.current) {
      ran.current = true;
      void search(initialQuery);
    }
  }, [autoSearch, initialQuery, search]);

  const choose = async (match: InfarmedMatch) => {
    onApply(await selectMatch(match, input));
  };

  const copyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(query);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(INFOMED_SEARCH_URL, "_blank", "noopener,noreferrer");
  };

  const saveLink = async () => {
    const parsed = parseInfomedUrl(link.url);
    if (!parsed) return setLinkErr(m.infarmed.invalidUrl);
    if ((link.leafletUrl && !isOfficialInfarmedUrl(link.leafletUrl)) || (link.spcUrl && !isOfficialInfarmedUrl(link.spcUrl))) {
      return setLinkErr(m.infarmed.invalidDocUrl);
    }
    if (!link.name.trim()) return setLinkErr(m.form.errors.nameRequired);
    setLinkErr(null);
    const opt = (s: string) => s.trim() || undefined;
    await choose({
      id: parsed.medGuid,
      name: link.name.trim(),
      activeSubstance: opt(link.activeSubstance),
      pharmaceuticalForm: opt(link.pharmaceuticalForm),
      strength: opt(link.strength),
      authorisationStatus: opt(link.authorisationStatus),
      holder: opt(link.holder),
      ean: input.ean,
      recordUrl: parsed.url,
      leafletUrl: opt(link.leafletUrl),
      spcUrl: opt(link.spcUrl),
      origin: "user-copied",
    });
    setShowLink(false);
  };

  const set = (k: keyof LinkForm) => (e: ChangeEvent<HTMLInputElement>) => setLink((l) => ({ ...l, [k]: e.target.value }));
  const matches = result ? [...result.cached, ...result.remote] : [];

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <Field label={m.infarmed.query} htmlFor="infarmed-q">
          <TextInput id="infarmed-q" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoComplete="off" />
        </Field>
        <Button type="submit" block disabled={busy || !query.trim()}>
          🔎 {busy ? m.infarmed.searching : m.infarmed.searchNow}
        </Button>
      </form>

      {result ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          {result.cached.length ? <h3 className="text-xl font-bold">{m.infarmed.cached}</h3> : null}
          {matches.length ? (
            <ul className="flex flex-col gap-3">
              {matches.map((match) => (
                <MatchCard key={match.id} match={match} onSelect={() => void choose(match)} />
              ))}
            </ul>
          ) : null}
          {result.remoteStatus === "unavailable" ? <Notice>{m.infarmed.unavailable}</Notice> : null}
          {result.remoteStatus === "offline" ? <Notice tone="warn">{m.infarmed.offline}</Notice> : null}
          {result.remoteStatus === "error" ? <Notice tone="error">{m.infarmed.error}</Notice> : null}
          {!matches.length && result.remoteStatus === "ok" ? <Notice tone="warn">{m.infarmed.noMatch}</Notice> : null}
        </div>
      ) : null}

      <Button variant="secondary" block onClick={() => void copyAndOpen()} disabled={!query.trim()}>
        {m.infarmed.copyAndOpen} ↗
      </Button>
      {copied ? <Notice tone="success">{m.infarmed.copied}</Notice> : null}
      <ExternalLink href={INFOMED_SEARCH_URL}>{m.infarmed.openInfomed}</ExternalLink>

      {!showLink ? (
        <Button variant="secondary" block onClick={() => setShowLink(true)}>
          🔗 {m.infarmed.linkTitle}
        </Button>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl bg-canvas p-4">
          <h3 className="text-xl font-bold">{m.infarmed.linkTitle}</h3>
          <p className="text-lg text-muted">{m.infarmed.linkIntro}</p>
          <Field label={m.infarmed.pageUrl} htmlFor="l-url">
            <TextInput id="l-url" type="url" inputMode="url" value={link.url} onChange={set("url")} placeholder={m.infarmed.pageUrlPlaceholder} />
          </Field>
          <Field label={m.infarmed.commercialName} htmlFor="l-name">
            <TextInput id="l-name" value={link.name} onChange={set("name")} />
          </Field>
          <Field label={m.infarmed.substance} htmlFor="l-sub">
            <TextInput id="l-sub" value={link.activeSubstance} onChange={set("activeSubstance")} />
          </Field>
          <Field label={m.infarmed.form} htmlFor="l-form">
            <TextInput id="l-form" value={link.pharmaceuticalForm} onChange={set("pharmaceuticalForm")} />
          </Field>
          <Field label={m.infarmed.strength} htmlFor="l-str">
            <TextInput id="l-str" value={link.strength} onChange={set("strength")} />
          </Field>
          <Field label={m.infarmed.status} hint={m.common.optional} htmlFor="l-status">
            <TextInput id="l-status" value={link.authorisationStatus} onChange={set("authorisationStatus")} />
          </Field>
          <Field label={m.infarmed.holder} hint={m.common.optional} htmlFor="l-holder">
            <TextInput id="l-holder" value={link.holder} onChange={set("holder")} />
          </Field>
          <Field label={m.infarmed.leafletUrl} htmlFor="l-fi">
            <TextInput id="l-fi" type="url" inputMode="url" value={link.leafletUrl} onChange={set("leafletUrl")} />
          </Field>
          <Field label={m.infarmed.spcUrl} htmlFor="l-rcm">
            <TextInput id="l-rcm" type="url" inputMode="url" value={link.spcUrl} onChange={set("spcUrl")} />
          </Field>
          {linkErr ? <Notice tone="error">{linkErr}</Notice> : null}
          <Button block onClick={() => void saveLink()}>
            {m.infarmed.saveRecord}
          </Button>
          <Button variant="ghost" onClick={() => setShowLink(false)}>
            {m.common.cancel}
          </Button>
        </div>
      )}
    </div>
  );
}
