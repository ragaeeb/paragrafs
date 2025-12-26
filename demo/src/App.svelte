<script lang="ts">
  import type { Segment, Token } from 'paragrafs'
  import {
    applyGroundTruthToSegment,
    cleanupIsolatedTokens,
    createHints,
    estimateSegmentFromToken,
    formatSecondsToTimestamp,
    formatSegmentsToTimestampedTranscript,
    generateHintsFromSegments,
    generateHintsFromTokens,
    getFirstMatchingToken,
    getFirstTokenForSelection,
    groupMarkedTokensIntoSegments,
    isEndingWithPunctuation,
    mapSegmentsIntoFormattedSegments,
    markAndCombineSegments,
    markTokensWithDividers,
    mergeSegments,
    mergeShortSegmentsWithPrevious,
    normalizeTokenText,
    splitSegment,
    tokenizeGroundTruth,
    updateSegmentWithGroundTruth,
  } from 'paragrafs'

  type TabId = 'pipeline' | 'groundTruth' | 'hints' | 'selection' | 'segments' | 'utils'

  const tabs: { id: TabId; title: string }[] = [
    { id: 'pipeline', title: 'Pipeline' },
    { id: 'groundTruth', title: 'Ground truth' },
    { id: 'hints', title: 'Hints' },
    { id: 'selection', title: 'Selection' },
    { id: 'segments', title: 'Segments' },
    { id: 'utils', title: 'Text utils' },
  ]

  let active: TabId = 'pipeline'

  const safeStringify = (value: unknown) => JSON.stringify(value, null, 2)

  const parseJson = <T,>(raw: string): { ok: true; value: T } | { ok: false; error: string } => {
    try {
      return { ok: true, value: JSON.parse(raw) as T }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  const parseNumber = (raw: string): { ok: true; value: number } | { ok: false; error: string } => {
    const v = Number(raw)
    if (!Number.isFinite(v)) {
      return { ok: false, error: 'Expected a finite number.' }
    }
    return { ok: true, value: v }
  }

  // -----------------------------
  // Pipeline demo
  // -----------------------------
  let pipelineSegmentsJson = safeStringify([
    {
      start: 0,
      end: 8,
      text: 'السلام عليكم ورحمة الله وبركاته احسن الله اليكم',
      tokens: [
        { start: 0, end: 1, text: 'السلام' },
        { start: 1, end: 2, text: 'عليكم' },
        { start: 2, end: 3, text: 'ورحمة' },
        { start: 3, end: 4, text: 'الله' },
        { start: 4, end: 5, text: 'وبركاته.' },
        { start: 6, end: 7, text: 'أَحْسَنَ' },
        { start: 7, end: 8, text: 'الله' },
      ],
    },
    {
      start: 9,
      end: 12,
      text: 'إليكم',
      tokens: [
        // gap triggers SEGMENT_BREAK
        { start: 10, end: 11, text: 'إليكم' },
      ],
    },
  ] satisfies Segment[])

  let pipelineOptionsJson = safeStringify({
    fillers: ['umm'],
    gapThreshold: 1.25,
    maxSecondsPerSegment: 12,
    minWordsPerSegment: 2,
  })

  let pipelineHintsJson = safeStringify(['احسن الله اليكم'])
  let pipelineHintsNormalizationJson = safeStringify({
    normalizeAlef: true,
    normalizeHamza: false,
    normalizeYa: true,
    removeTatweel: true,
  })

  let pipelineMaxSecondsPerLine = '6'

  let pipelineError = ''
  let pipelineOutMarkedTokens = ''
  let pipelineOutCleanedTokens = ''
  let pipelineOutGrouped = ''
  let pipelineOutMerged = ''
  let pipelineOutCombined = ''
  let pipelineOutFormattedSegments = ''
  let pipelineOutTranscript = ''

  const runPipeline = () => {
    pipelineError = ''

    const segs = parseJson<Segment[]>(pipelineSegmentsJson)
    if (!segs.ok) {
      pipelineError = `segments JSON: ${segs.error}`
      return
    }

    const opts = parseJson<Record<string, unknown>>(pipelineOptionsJson)
    if (!opts.ok) {
      pipelineError = `options JSON: ${opts.error}`
      return
    }

    const maxLine = parseNumber(pipelineMaxSecondsPerLine)
    if (!maxLine.ok) {
      pipelineError = `maxSecondsPerLine: ${maxLine.error}`
      return
    }

    const hintStrings = parseJson<string[]>(pipelineHintsJson)
    if (!hintStrings.ok) {
      pipelineError = `hints JSON: ${hintStrings.error}`
      return
    }

    const hintNorm = parseJson<Record<string, unknown>>(pipelineHintsNormalizationJson)
    if (!hintNorm.ok) {
      pipelineError = `hints normalization JSON: ${hintNorm.error}`
      return
    }

    const hints =
      hintStrings.value.length > 0 ? createHints(hintNorm.value as never, ...hintStrings.value) : undefined

    const flatTokens = segs.value.flatMap((s) => s.tokens)
    const markedTokens = markTokensWithDividers(flatTokens, {
      fillers: (opts.value.fillers as string[] | undefined) ?? [],
      gapThreshold: (opts.value.gapThreshold as number) ?? 2,
      hints,
    })
    const cleaned = cleanupIsolatedTokens(markedTokens)
    const grouped = groupMarkedTokensIntoSegments(
      cleaned,
      (opts.value.maxSecondsPerSegment as number) ?? 12,
    )
    const merged = mergeShortSegmentsWithPrevious(grouped, (opts.value.minWordsPerSegment as number) ?? 2)

    const combined = markAndCombineSegments(segs.value, {
      fillers: (opts.value.fillers as string[] | undefined) ?? [],
      gapThreshold: (opts.value.gapThreshold as number) ?? 2,
      hints,
      maxSecondsPerSegment: (opts.value.maxSecondsPerSegment as number) ?? 12,
      minWordsPerSegment: (opts.value.minWordsPerSegment as number) ?? 2,
    })

    const formatted = mapSegmentsIntoFormattedSegments(combined, maxLine.value)
    const transcript = formatSegmentsToTimestampedTranscript(combined, maxLine.value)

    pipelineOutMarkedTokens = safeStringify(markedTokens)
    pipelineOutCleanedTokens = safeStringify(cleaned)
    pipelineOutGrouped = safeStringify(grouped)
    pipelineOutMerged = safeStringify(merged)
    pipelineOutCombined = safeStringify(combined)
    pipelineOutFormattedSegments = safeStringify(formatted)
    pipelineOutTranscript = transcript
  }

  // -----------------------------
  // Ground truth demo
  // -----------------------------
  let gtSegmentJson = safeStringify({
    start: 0,
    end: 6,
    text: 'The Buick crown flock jumps',
    tokens: [
      { start: 0, end: 1, text: 'The' },
      { start: 1, end: 2, text: 'Buick' },
      { start: 2, end: 3, text: 'crown' },
      { start: 3, end: 4, text: 'flock' },
      { start: 4, end: 6, text: 'jumps' },
    ],
  } satisfies Segment)

  let gtText = 'The quick brown fox jumps'
  let gtError = ''
  let gtOutUpdated = ''
  let gtOutApplied = ''

  const runGroundTruth = () => {
    gtError = ''
    const seg = parseJson<Segment>(gtSegmentJson)
    if (!seg.ok) {
      gtError = `segment JSON: ${seg.error}`
      return
    }

    gtOutUpdated = safeStringify(updateSegmentWithGroundTruth(seg.value, gtText))
    gtOutApplied = safeStringify(applyGroundTruthToSegment(seg.value, gtText))
  }

  // -----------------------------
  // Hints demo
  // -----------------------------
  let hintsTokensJson = safeStringify([
    { start: 0, end: 1, text: 'أَحْسَنَ' },
    { start: 1, end: 2, text: 'الله' },
    { start: 2, end: 3, text: 'إليكم' },
    { start: 3, end: 4, text: 'أَحْسَنَ' },
    { start: 4, end: 5, text: 'الله' },
    { start: 5, end: 6, text: 'إليكم.' },
  ] satisfies Token[])

  let hintsSegmentsJson = pipelineSegmentsJson
  let hintsOptionsJson = safeStringify({
    minN: 2,
    maxN: 4,
    minCount: 2,
    topK: 25,
    dedupe: 'closed',
    boundaryStrategy: 'segment',
    normalization: { normalizeAlef: true, normalizeYa: true, removeTatweel: true, normalizeHamza: false },
  })

  let hintsError = ''
  let hintsOutTokens = ''
  let hintsOutSegments = ''
  let hintsOutCreateHints = ''

  const runHints = () => {
    hintsError = ''

    const toks = parseJson<Token[]>(hintsTokensJson)
    if (!toks.ok) {
      hintsError = `tokens JSON: ${toks.error}`
      return
    }

    const segs = parseJson<Segment[]>(hintsSegmentsJson)
    if (!segs.ok) {
      hintsError = `segments JSON: ${segs.error}`
      return
    }

    const opts = parseJson<Record<string, unknown>>(hintsOptionsJson)
    if (!opts.ok) {
      hintsError = `options JSON: ${opts.error}`
      return
    }

    const minedFromTokens = generateHintsFromTokens(toks.value, opts.value as never)
    const minedFromSegments = generateHintsFromSegments(segs.value, opts.value as never)

    const asHints = createHints(
      ((opts.value.normalization as Record<string, unknown> | undefined) ?? {}) as never,
      ...minedFromTokens.slice(0, 10).map((h) => h.phrase),
    )

    hintsOutTokens = safeStringify(minedFromTokens)
    hintsOutSegments = safeStringify(minedFromSegments)
    hintsOutCreateHints = safeStringify(asHints)
  }

  // -----------------------------
  // Selection demo
  // -----------------------------
  let selTokensJson = hintsTokensJson
  let selQuery = 'احسن الله اليكم'
  let selSegmentJson = safeStringify({
    start: 0,
    end: 10,
    text: 'Hello world.\nSecond line here.',
    tokens: [
      { start: 0, end: 1, text: 'Hello' },
      { start: 1, end: 2, text: 'world.' },
      { start: 6, end: 7, text: 'Second' },
      { start: 7, end: 8, text: 'line' },
      { start: 8, end: 10, text: 'here.' },
    ],
  } satisfies Segment)
  let selStart = '0'
  let selEnd = '5'
  let selError = ''
  let selOutMatch = ''
  let selOutSelection = ''

  const runSelection = () => {
    selError = ''

    const toks = parseJson<Token[]>(selTokensJson)
    if (!toks.ok) {
      selError = `tokens JSON: ${toks.error}`
      return
    }

    const seg = parseJson<Segment>(selSegmentJson)
    if (!seg.ok) {
      selError = `segment JSON: ${seg.error}`
      return
    }

    const s0 = parseNumber(selStart)
    if (!s0.ok) {
      selError = `selectionStart: ${s0.error}`
      return
    }

    const s1 = parseNumber(selEnd)
    if (!s1.ok) {
      selError = `selectionEnd: ${s1.error}`
      return
    }

    selOutMatch = safeStringify(getFirstMatchingToken(toks.value, selQuery))
    selOutSelection = safeStringify(getFirstTokenForSelection(seg.value, s0.value, s1.value))
  }

  // -----------------------------
  // Segments demo
  // -----------------------------
  let segTokenJson = safeStringify({ start: 0, end: 4, text: 'split this token' } satisfies Token)
  let segSegmentsJson = safeStringify([
    {
      start: 0,
      end: 2,
      text: 'Hello world',
      tokens: [
        { start: 0, end: 1, text: 'Hello' },
        { start: 1, end: 2, text: 'world' },
      ],
    },
    {
      start: 2,
      end: 4,
      text: 'again!',
      tokens: [{ start: 2, end: 4, text: 'again!' }],
    },
  ] satisfies Segment[])
  let segDelimiter = ' '
  let segSplitSegmentJson = safeStringify({
    start: 0,
    end: 6,
    text: 'one two three four',
    tokens: [
      { start: 0, end: 1.5, text: 'one' },
      { start: 1.5, end: 3, text: 'two' },
      { start: 3, end: 4.5, text: 'three' },
      { start: 4.5, end: 6, text: 'four' },
    ],
  } satisfies Segment)
  let segSplitTime = '3'
  let segError = ''
  let segOutEstimate = ''
  let segOutMerge = ''
  let segOutSplit = ''

  const runSegments = () => {
    segError = ''

    const tok = parseJson<Token>(segTokenJson)
    if (!tok.ok) {
      segError = `token JSON: ${tok.error}`
      return
    }
    segOutEstimate = safeStringify(estimateSegmentFromToken(tok.value))

    const segs = parseJson<Segment[]>(segSegmentsJson)
    if (!segs.ok) {
      segError = `segments JSON: ${segs.error}`
      return
    }
    segOutMerge = safeStringify(mergeSegments(segs.value, segDelimiter))

    const splitSeg = parseJson<Segment>(segSplitSegmentJson)
    if (!splitSeg.ok) {
      segError = `split segment JSON: ${splitSeg.error}`
      return
    }
    const st = parseNumber(segSplitTime)
    if (!st.ok) {
      segError = `splitTime: ${st.error}`
      return
    }
    segOutSplit = safeStringify(splitSegment(splitSeg.value, st.value))
  }

  // -----------------------------
  // Utils demo
  // -----------------------------
  let utilsText = 'أَحْسَنَ اللهُ إِلَيْكُم…'
  let utilsNormOptionsJson = safeStringify({ normalizeAlef: true, normalizeYa: true, removeTatweel: true })
  let utilsSeconds = '65'
  let utilsPunctText = 'مرحبا؛'
  let utilsGroundTruthText = 'السلام عليكم . كيف الحال ؟'
  let utilsError = ''
  let utilsOutNormalize = ''
  let utilsOutTimestamp = ''
  let utilsOutPunct = ''
  let utilsOutTokenize = ''

  const runUtils = () => {
    utilsError = ''
    const norm = parseJson<Record<string, unknown>>(utilsNormOptionsJson)
    if (!norm.ok) {
      utilsError = `normalization JSON: ${norm.error}`
      return
    }
    utilsOutNormalize = normalizeTokenText(utilsText, norm.value as never)

    const secs = parseNumber(utilsSeconds)
    if (!secs.ok) {
      utilsError = `seconds: ${secs.error}`
      return
    }
    utilsOutTimestamp = formatSecondsToTimestamp(secs.value)
    utilsOutPunct = String(isEndingWithPunctuation(utilsPunctText))
    utilsOutTokenize = safeStringify(tokenizeGroundTruth(utilsGroundTruthText))
  }
</script>

<header class="header">
  <div class="title">paragrafs demo</div>
  <div class="subtitle">
    Local playground for the library’s major exports. Build → deploy static to <code>paragrafs.surge.sh</code>.
  </div>
</header>

<nav class="tabs" aria-label="Demo tabs">
  {#each tabs as t}
    <button class="tab {active === t.id ? 'active' : ''}" on:click={() => (active = t.id)} type="button">
      {t.title}
    </button>
  {/each}
</nav>

{#if active === 'pipeline'}
  <section class="panel">
    <h2>Pipeline (tokens → markers → segments → formatted text)</h2>
    <p class="help">
      Uses <code>markTokensWithDividers</code>, <code>cleanupIsolatedTokens</code>, <code>groupMarkedTokensIntoSegments</code>,
      <code>mergeShortSegmentsWithPrevious</code>, <code>markAndCombineSegments</code>, <code>mapSegmentsIntoFormattedSegments</code>,
      and <code>formatSegmentsToTimestampedTranscript</code>.
    </p>

    <div class="grid-2">
      <div class="panel">
        <div class="label">segments (Segment[] JSON)</div>
        <textarea class="textarea" bind:value={pipelineSegmentsJson}></textarea>

        <div class="label" style="margin-top: 12px;">pipeline options (JSON)</div>
        <textarea class="textarea" bind:value={pipelineOptionsJson}></textarea>

        <div class="grid-2" style="margin-top: 12px;">
          <div>
            <div class="label">hints (string[] JSON)</div>
            <textarea class="textarea" bind:value={pipelineHintsJson}></textarea>
          </div>
          <div>
            <div class="label">hints normalization (JSON)</div>
            <textarea class="textarea" bind:value={pipelineHintsNormalizationJson}></textarea>
          </div>
        </div>

        <div class="label" style="margin-top: 12px;">maxSecondsPerLine</div>
        <input class="input" bind:value={pipelineMaxSecondsPerLine} />

        <div style="display:flex; gap: 10px; margin-top: 12px;">
          <button class="btn" type="button" on:click={runPipeline}>Run</button>
        </div>

        {#if pipelineError}
          <div class="error" style="margin-top: 12px;">{pipelineError}</div>
        {/if}
      </div>

      <div class="panel">
        <div class="label">markedTokens</div>
        <pre class="out">{pipelineOutMarkedTokens || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">cleanupIsolatedTokens(markedTokens)</div>
        <pre class="out">{pipelineOutCleanedTokens || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">grouped segments</div>
        <pre class="out">{pipelineOutGrouped || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">merged short segments</div>
        <pre class="out">{pipelineOutMerged || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">markAndCombineSegments output</div>
        <pre class="out">{pipelineOutCombined || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">mapSegmentsIntoFormattedSegments output</div>
        <pre class="out">{pipelineOutFormattedSegments || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">formatSegmentsToTimestampedTranscript output</div>
        <pre class="out">{pipelineOutTranscript || '(run to see output)'}</pre>
      </div>
    </div>
  </section>
{/if}

{#if active === 'groundTruth'}
  <section class="panel">
    <h2>Ground truth alignment</h2>
    <p class="help">
      Uses <code>updateSegmentWithGroundTruth</code> (keeps unknowns) and <code>applyGroundTruthToSegment</code> (filters unknowns).
    </p>

    <div class="grid-2">
      <div class="panel">
        <div class="label">segment (Segment JSON)</div>
        <textarea class="textarea" bind:value={gtSegmentJson}></textarea>

        <div class="label" style="margin-top: 12px;">groundTruth (string)</div>
        <textarea class="textarea" bind:value={gtText}></textarea>

        <button class="btn" type="button" on:click={runGroundTruth} style="margin-top: 12px;">Run</button>

        {#if gtError}
          <div class="error" style="margin-top: 12px;">{gtError}</div>
        {/if}
      </div>

      <div class="panel">
        <div class="label">updateSegmentWithGroundTruth output</div>
        <pre class="out">{gtOutUpdated || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">applyGroundTruthToSegment output</div>
        <pre class="out">{gtOutApplied || '(run to see output)'}</pre>
      </div>
    </div>
  </section>
{/if}

{#if active === 'hints'}
  <section class="panel">
    <h2>Auto-hints + hint map</h2>
    <p class="help">
      Uses <code>generateHintsFromTokens</code>, <code>generateHintsFromSegments</code>, and <code>createHints</code>.
    </p>

    <div class="grid-2">
      <div class="panel">
        <div class="label">tokens (Token[] JSON)</div>
        <textarea class="textarea" bind:value={hintsTokensJson}></textarea>

        <div class="label" style="margin-top: 12px;">segments (Segment[] JSON)</div>
        <textarea class="textarea" bind:value={hintsSegmentsJson}></textarea>

        <div class="label" style="margin-top: 12px;">options (GenerateHintsOptions JSON)</div>
        <textarea class="textarea" bind:value={hintsOptionsJson}></textarea>

        <button class="btn" type="button" on:click={runHints} style="margin-top: 12px;">Run</button>

        {#if hintsError}
          <div class="error" style="margin-top: 12px;">{hintsError}</div>
        {/if}
      </div>

      <div class="panel">
        <div class="label">generateHintsFromTokens output</div>
        <pre class="out">{hintsOutTokens || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">generateHintsFromSegments output</div>
        <pre class="out">{hintsOutSegments || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">createHints(normalization, ...topPhrases) output</div>
        <pre class="out">{hintsOutCreateHints || '(run to see output)'}</pre>
      </div>
    </div>
  </section>
{/if}

{#if active === 'selection'}
  <section class="panel">
    <h2>Selection helpers</h2>
    <p class="help">
      Uses <code>getFirstMatchingToken</code> (phrase search) and <code>getFirstTokenForSelection</code> (cursor selection → token).
    </p>

    <div class="grid-2">
      <div class="panel">
        <div class="label">tokens (Token[] JSON)</div>
        <textarea class="textarea" bind:value={selTokensJson}></textarea>

        <div class="label" style="margin-top: 12px;">query (string)</div>
        <input class="input" bind:value={selQuery} />

        <div class="label" style="margin-top: 12px;">segment (Segment JSON)</div>
        <textarea class="textarea" bind:value={selSegmentJson}></textarea>

        <div class="grid-2" style="margin-top: 12px;">
          <div>
            <div class="label">selectionStart</div>
            <input class="input" bind:value={selStart} />
          </div>
          <div>
            <div class="label">selectionEnd</div>
            <input class="input" bind:value={selEnd} />
          </div>
        </div>

        <button class="btn" type="button" on:click={runSelection} style="margin-top: 12px;">Run</button>

        {#if selError}
          <div class="error" style="margin-top: 12px;">{selError}</div>
        {/if}
      </div>

      <div class="panel">
        <div class="label">getFirstMatchingToken output</div>
        <pre class="out">{selOutMatch || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">getFirstTokenForSelection output</div>
        <pre class="out">{selOutSelection || '(run to see output)'}</pre>
      </div>
    </div>
  </section>
{/if}

{#if active === 'segments'}
  <section class="panel">
    <h2>Segment utilities</h2>
    <p class="help">Uses <code>estimateSegmentFromToken</code>, <code>mergeSegments</code>, and <code>splitSegment</code>.</p>

    <div class="grid-2">
      <div class="panel">
        <div class="label">estimateSegmentFromToken input (Token JSON)</div>
        <textarea class="textarea" bind:value={segTokenJson}></textarea>

        <div class="label" style="margin-top: 12px;">mergeSegments input (Segment[] JSON)</div>
        <textarea class="textarea" bind:value={segSegmentsJson}></textarea>

        <div class="label" style="margin-top: 12px;">merge delimiter</div>
        <input class="input" bind:value={segDelimiter} />

        <div class="label" style="margin-top: 12px;">splitSegment input (Segment JSON)</div>
        <textarea class="textarea" bind:value={segSplitSegmentJson}></textarea>

        <div class="label" style="margin-top: 12px;">splitTime</div>
        <input class="input" bind:value={segSplitTime} />

        <button class="btn" type="button" on:click={runSegments} style="margin-top: 12px;">Run</button>

        {#if segError}
          <div class="error" style="margin-top: 12px;">{segError}</div>
        {/if}
      </div>

      <div class="panel">
        <div class="label">estimateSegmentFromToken output</div>
        <pre class="out">{segOutEstimate || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">mergeSegments output</div>
        <pre class="out">{segOutMerge || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">splitSegment output</div>
        <pre class="out">{segOutSplit || '(run to see output)'}</pre>
      </div>
    </div>
  </section>
{/if}

{#if active === 'utils'}
  <section class="panel">
    <h2>Text utilities</h2>
    <p class="help">
      Uses <code>normalizeTokenText</code>, <code>formatSecondsToTimestamp</code>, <code>isEndingWithPunctuation</code>, and
      <code>tokenizeGroundTruth</code>.
    </p>

    <div class="grid-2">
      <div class="panel">
        <div class="label">normalizeTokenText input (string)</div>
        <input class="input" bind:value={utilsText} />

        <div class="label" style="margin-top: 12px;">normalization options (JSON)</div>
        <textarea class="textarea" bind:value={utilsNormOptionsJson}></textarea>

        <div class="label" style="margin-top: 12px;">seconds → timestamp</div>
        <input class="input" bind:value={utilsSeconds} />

        <div class="label" style="margin-top: 12px;">isEndingWithPunctuation input</div>
        <input class="input" bind:value={utilsPunctText} />

        <div class="label" style="margin-top: 12px;">tokenizeGroundTruth input</div>
        <textarea class="textarea" bind:value={utilsGroundTruthText}></textarea>

        <button class="btn" type="button" on:click={runUtils} style="margin-top: 12px;">Run</button>

        {#if utilsError}
          <div class="error" style="margin-top: 12px;">{utilsError}</div>
        {/if}
      </div>

      <div class="panel">
        <div class="label">normalizeTokenText output</div>
        <pre class="out">{utilsOutNormalize || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">formatSecondsToTimestamp output</div>
        <pre class="out">{utilsOutTimestamp || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">isEndingWithPunctuation output</div>
        <pre class="out">{utilsOutPunct || '(run to see output)'}</pre>

        <div class="label" style="margin-top: 12px;">tokenizeGroundTruth output</div>
        <pre class="out">{utilsOutTokenize || '(run to see output)'}</pre>
      </div>
    </div>
  </section>
{/if}

<style>
  .header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .title {
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 0.2px;
  }

  .subtitle {
    opacity: 0.8;
    font-size: 13px;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 14px 0;
  }

  .tab {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    padding: 8px 10px;
    border-radius: 999px;
    cursor: pointer;
  }

  .tab.active {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.12);
  }

  h2 {
    margin: 6px 0 8px;
    font-size: 16px;
  }
</style>
