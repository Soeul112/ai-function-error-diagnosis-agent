const MISCONCEPTION_NAMES = {
  "m-domain-missing": "条件遗漏",
  "m-boundary": "边界条件错误",
  "m-range-local": "局部看式子",
  "m-range-direction": "开口方向误判",
  "m-mono-opening": "开口方向与单调性混淆",
  "m-axis": "对称轴/斜率判断错误",
  "m-parity-sample": "以点代证",
  "m-parity-domain": "忽略定义域对称",
  "m-zero-coordinate": "零点与交点混淆",
  "m-factor": "因式分解或零点遗漏",
  "m-expression": "表达不规范",
};

const INF = Number.POSITIVE_INFINITY;
const NEG_INF = Number.NEGATIVE_INFINITY;

const ANSWER_SPECS = {
  "q-domain-1": intervalSpec("[1,3)∪(3,+∞)", [
    lowerCondition("x≥1", 1, true),
    excludeCondition("x≠3", 3),
  ], "m-domain-missing"),
  "var-q-domain-1": intervalSpec("(2,+∞)", [
    lowerCondition("x>2", 2, false),
  ], "m-boundary"),
  "q-domain-2": intervalSpec("(-2,+∞)", [lowerCondition("x>-2", -2, false)], "m-boundary"),
  "var-q-domain-2": intervalSpec("(1/2,+∞)", [lowerCondition("x>1/2", 0.5, false)], "m-boundary"),
  "q-domain-3": intervalSpec("(4,+∞)", [lowerCondition("x>4", 4, false)], "m-boundary"),
  "var-q-domain-3": intervalSpec("(3,+∞)", [lowerCondition("x>3", 3, false)], "m-boundary"),
  "q-domain-4": intervalSpec("[3,5)∪(5,+∞)", [
    lowerCondition("x≥3", 3, true),
    excludeCondition("x≠5", 5),
  ], "m-domain-missing"),
  "var-q-domain-4": intervalSpec("[1,4)∪(4,+∞)", [
    lowerCondition("x≥1", 1, true),
    excludeCondition("x≠4", 4),
  ], "m-domain-missing"),

  "q-range-1": intervalSpec("[1,+∞)", [lowerCondition("y≥1", 1, true)], "m-range-local"),
  "var-q-range-1": intervalSpec("[1,+∞)", [lowerCondition("y≥1", 1, true)], "m-range-local"),
  "q-range-2": intervalSpec("(-∞,3]", [upperCondition("y≤3", 3, true)], "m-range-direction"),
  "var-q-range-2": intervalSpec("(-∞,5]", [upperCondition("y≤5", 5, true)], "m-range-direction"),
  "q-range-3": intervalSpec("[-1,7]", [
    lowerCondition("y≥-1", -1, true),
    upperCondition("y≤7", 7, true),
  ], "m-range-local"),
  "var-q-range-3": intervalSpec("[-10,2]", [
    lowerCondition("y≥-10", -10, true),
    upperCondition("y≤2", 2, true),
  ], "m-range-local"),
  "q-range-4": intervalSpec("[2,6]", [
    lowerCondition("y≥2", 2, true),
    upperCondition("y≤6", 6, true),
  ], "m-range-local"),
  "var-q-range-4": intervalSpec("[-1,8]", [
    lowerCondition("y≥-1", -1, true),
    upperCondition("y≤8", 8, true),
  ], "m-range-local"),

  "q-zero-1": zeroSpec([2, 3], "m-factor"),
  "var-q-zero-1": zeroSpec([3, 4], "m-factor"),
  "q-zero-2": zeroSpec([], "m-factor"),
  "var-q-zero-2": zeroSpec([], "m-factor"),
  "q-zero-3": zeroSpec([3], "m-zero-coordinate"),
  "var-q-zero-3": zeroSpec([2], "m-zero-coordinate"),
  "q-zero-4": zeroSpec([-2, 0, 1], "m-factor"),
  "var-q-zero-4": zeroSpec([-1, 0, 2, 3], "m-factor"),

  "q-parity-1": conceptSpec("odd", "奇函数", "m-parity-sample"),
  "var-q-parity-1": conceptSpec("odd", "奇函数", "m-parity-sample"),
  "q-parity-2": conceptSpec("even", "偶函数", "m-parity-sample"),
  "var-q-parity-2": conceptSpec("even", "偶函数", "m-parity-sample"),
  "q-parity-3": conceptSpec("neither", "非奇非偶函数", "m-parity-sample"),
  "var-q-parity-3": conceptSpec("neither", "非奇非偶函数", "m-parity-sample"),
  "q-parity-4": conceptSpec("neither", "非奇非偶函数", "m-parity-domain"),
  "var-q-parity-4": conceptSpec("neither", "非奇非偶函数", "m-parity-domain"),

  "q-mono-1": textSpec(["递减", "递增", "2"], "m-mono-opening"),
  "var-q-mono-1": textSpec(["递减", "递增", "-1"], "m-mono-opening"),
  "q-mono-2": textSpec(["递增", "递减", "1"], "m-range-direction"),
  "var-q-mono-2": textSpec(["递增", "递减", "-2"], "m-range-direction"),
  "q-mono-3": textSpec(["递减"], "m-axis"),
  "var-q-mono-3": textSpec(["递增"], "m-axis"),
  "q-mono-4": textSpec(["递减", "递增", "-1"], "m-mono-opening"),
  "var-q-mono-4": textSpec(["递减", "递增", "2"], "m-mono-opening"),
};

function intervalSpec(answer, conditions, defaultMisconceptionId) {
  return {
    type: "interval",
    intervals: parseIntervalUnion(answer),
    canonicalAnswer: answer,
    conditions,
    defaultMisconceptionId,
  };
}

function zeroSpec(values, defaultMisconceptionId) {
  return {
    type: "zero-set",
    values: [...values].sort((a, b) => a - b),
    canonicalAnswer: values.length ? values.map((value) => `x=${formatNumber(value)}`).join("，") : "没有实数零点",
    defaultMisconceptionId,
  };
}

function conceptSpec(value, label, defaultMisconceptionId) {
  return { type: "concept-label", value, label, canonicalAnswer: label, defaultMisconceptionId };
}

function textSpec(requiredTokens, defaultMisconceptionId) {
  return { type: "text-pattern", requiredTokens, defaultMisconceptionId };
}

function lowerCondition(label, value, inclusive) {
  return { type: "lower", label, value, inclusive };
}

function upperCondition(label, value, inclusive) {
  return { type: "upper", label, value, inclusive };
}

function excludeCondition(label, value) {
  return { type: "exclude", label, value };
}

export function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[【]/g, "[")
    .replace(/[】]/g, "]")
    .replace(/[，、；;]/g, ",")
    .replace(/[＋]/g, "+")
    .replace(/[－−]/g, "-")
    .replace(/[＝]/g, "=")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/[≠]/g, "!=")
    .replace(/不等于/g, "!=")
    .replace(/大于等于/g, ">=")
    .replace(/小于等于/g, "<=")
    .replace(/大于/g, ">")
    .replace(/小于/g, "<")
    .replace(/[∞]/g, "inf")
    .replace(/无穷/g, "inf")
    .replace(/并且|且|以及|和|或/g, ",")
    .replace(/属于/g, "")
    .replace(/定义域|值域|零点|是|为/g, "");
}

export function analyzeAnswer(answer, assessment, options = {}) {
  const spec = getAnswerSpec(assessment, options.sourceQuestion);
  const normalizedAnswer = normalizeAnswer(answer);
  const answerType = inferAnswerType(normalizedAnswer, spec);

  if (!normalizedAnswer) {
    return baseAnalysis({
      spec,
      answerType: "empty",
      normalizedAnswer,
      equivalent: false,
      confidence: 0.98,
      evidence: ["没有检测到有效作答内容。"],
      misconceptionIds: ["m-expression"],
    });
  }

  if (!spec) {
    const equivalent = normalizedAnswer === normalizeAnswer(assessment.correctAnswer ?? assessment.answer);
    return baseAnalysis({
      spec,
      answerType,
      normalizedAnswer,
      equivalent,
      confidence: equivalent ? 0.72 : 0.45,
      evidence: equivalent ? ["文本归一化后与参考答案一致。"] : ["当前题型暂未配置结构化校验，使用文本兜底比对。"],
      misconceptionIds: equivalent ? [] : ["m-expression"],
    });
  }

  if (spec.type === "interval") {
    return analyzeIntervalAnswer(normalizedAnswer, answerType, spec);
  }
  if (spec.type === "zero-set") {
    return analyzeZeroAnswer(normalizedAnswer, answerType, spec);
  }
  if (spec.type === "concept-label") {
    return analyzeConceptAnswer(normalizedAnswer, answerType, spec);
  }
  return analyzeTextAnswer(normalizedAnswer, answerType, spec);
}

export function getAnswerSpec(assessment, sourceQuestion) {
  return ANSWER_SPECS[assessment?.id] ?? ANSWER_SPECS[`var-${sourceQuestion?.id}`] ?? null;
}

export function buildFollowUpPrompt(analysis, question) {
  if (analysis.equivalent) {
    return "你的答案和参考答案等价。请再用一句话说明关键限制条件或判断依据，确认不是只记住答案。";
  }
  const evidence = analysis.evidence[0] ?? "系统发现你的答案和参考答案不等价。";
  if (analysis.missingConditions.length) {
    return `${evidence} 你能补充这个限制条件来自题目中的哪一部分吗？`;
  }
  if (analysis.extraConditions.length) {
    return `${evidence} 这个端点或条件为什么要保留/排除？请用原式代回检查。`;
  }
  return question.followUp;
}

export function buildAnalysisSummary(analysis) {
  if (analysis.equivalent) {
    return `结构化校验通过：系统识别为${analysis.answerType}，与参考答案等价。`;
  }
  const misses = analysis.missingConditions.length ? `缺少：${analysis.missingConditions.join("、")}。` : "";
  const extras = analysis.extraConditions.length ? `多出/误排除：${analysis.extraConditions.join("、")}。` : "";
  return `结构化校验未通过：${misses}${extras}${analysis.evidence[0] ?? ""}`;
}

function analyzeIntervalAnswer(normalizedAnswer, answerType, spec) {
  const answerIntervals = parseIntervalUnion(normalizedAnswer) ?? parseInequalitySet(normalizedAnswer);
  if (!answerIntervals) {
    return baseAnalysis({
      spec,
      answerType,
      normalizedAnswer,
      equivalent: false,
      confidence: 0.62,
      evidence: ["没有解析出可比对的区间或不等式结构。"],
      misconceptionIds: ["m-expression"],
    });
  }

  const equivalent = intervalsEqual(answerIntervals, spec.intervals);
  const missingConditions = [];
  const extraConditions = [];
  const evidence = [];

  for (const condition of spec.conditions) {
    const result = checkCondition(answerIntervals, condition);
    if (!result.ok) {
      missingConditions.push(condition.label);
      evidence.push(result.evidence);
    }
  }

  const endpointDiffs = compareEndpointClosures(answerIntervals, spec.intervals);
  extraConditions.push(...endpointDiffs.extra);
  evidence.push(...endpointDiffs.evidence);

  const misconceptionIds = equivalent
    ? []
    : pickIntervalMisconceptions({ missingConditions, extraConditions, evidence, spec });

  return baseAnalysis({
    spec,
    answerType: answerType === "interval" ? "interval" : "inequality",
    normalizedAnswer: intervalsToText(answerIntervals),
    equivalent,
    missingConditions,
    extraConditions,
    confidence: equivalent ? 0.94 : 0.86,
    evidence: equivalent
      ? [`${intervalsToText(answerIntervals)} 与 ${spec.canonicalAnswer} 表示同一取值集合。`]
      : evidence.length
        ? evidence
        : [`解析出的集合 ${intervalsToText(answerIntervals)} 与参考集合 ${spec.canonicalAnswer} 不一致。`],
    misconceptionIds,
  });
}

function analyzeZeroAnswer(normalizedAnswer, answerType, spec) {
  if (containsCoordinatePoint(normalizedAnswer)) {
    return baseAnalysis({
      spec,
      answerType: "coordinate-point",
      normalizedAnswer,
      equivalent: false,
      confidence: 0.92,
      evidence: ["答案写成了坐标点形式；本题问的是零点的 x 值，不是与 x 轴交点坐标。"],
      misconceptionIds: ["m-zero-coordinate"],
    });
  }

  const values = parseZeroValues(normalizedAnswer);
  const equivalent = numberArraysEqual(values, spec.values);
  const missing = spec.values.filter((value) => !values.includes(value));
  const extra = values.filter((value) => !spec.values.includes(value));

  return baseAnalysis({
    spec,
    answerType: "zero-set",
    normalizedAnswer: values.length ? values.map((value) => `x=${formatNumber(value)}`).join(",") : "no-real-zero",
    equivalent,
    missingConditions: missing.map((value) => `x=${formatNumber(value)}`),
    extraConditions: extra.map((value) => `x=${formatNumber(value)}`),
    confidence: equivalent ? 0.95 : 0.88,
    evidence: equivalent
      ? ["零点集合与参考答案一致。"]
      : [
          missing.length ? `漏掉零点：${missing.map(formatNumber).join("、")}。` : "",
          extra.length ? `多写了不属于本题的零点：${extra.map(formatNumber).join("、")}。` : "",
        ].filter(Boolean),
    misconceptionIds: equivalent ? [] : [spec.defaultMisconceptionId],
  });
}

function analyzeConceptAnswer(normalizedAnswer, answerType, spec) {
  const value = parseConceptLabel(normalizedAnswer);
  const equivalent = value === spec.value;
  const sampleOnly = /1,-1|-1,1|代入/.test(normalizedAnswer);
  const misconceptionIds = equivalent ? [] : [sampleOnly ? "m-parity-sample" : spec.defaultMisconceptionId];
  return baseAnalysis({
    spec,
    answerType: "concept-label",
    normalizedAnswer: value ?? normalizedAnswer,
    equivalent,
    confidence: equivalent ? 0.9 : 0.78,
    evidence: equivalent
      ? [`识别到概念标签“${spec.label}”，与参考判断一致。`]
      : [sampleOnly ? "答案只出现代入特殊点的痕迹，不能替代一般性证明。" : `识别到的概念标签与“${spec.label}”不一致。`],
    misconceptionIds,
  });
}

function analyzeTextAnswer(normalizedAnswer, answerType, spec) {
  const equivalent = spec.requiredTokens.every((token) => normalizedAnswer.includes(token));
  return baseAnalysis({
    spec,
    answerType,
    normalizedAnswer,
    equivalent,
    confidence: equivalent ? 0.76 : 0.58,
    evidence: equivalent
      ? ["文本中包含本题关键判断词，进入步骤表达检查。"]
      : [`缺少关键判断词：${spec.requiredTokens.filter((token) => !normalizedAnswer.includes(token)).join("、")}。`],
    misconceptionIds: equivalent ? [] : [spec.defaultMisconceptionId],
  });
}

function baseAnalysis({
  spec,
  answerType,
  normalizedAnswer,
  equivalent,
  missingConditions = [],
  extraConditions = [],
  confidence,
  evidence,
  misconceptionIds,
}) {
  const candidates = misconceptionIds.map((id) => ({
    id,
    name: MISCONCEPTION_NAMES[id] ?? id,
    reason: evidence[0] ?? "由学生答案结构触发。",
  }));
  return {
    answerType,
    normalizedAnswer,
    equivalent,
    equivalenceResult: equivalent ? "equivalent" : "not_equivalent",
    expectedAnswer: spec?.canonicalAnswer ?? "",
    missingConditions,
    extraConditions,
    misconceptionCandidates: candidates,
    confidence,
    evidence,
  };
}

function inferAnswerType(normalizedAnswer, spec) {
  if (containsCoordinatePoint(normalizedAnswer)) return "coordinate-point";
  if (parseIntervalUnion(normalizedAnswer)) return "interval";
  if (/x(>=|>|<=|<|=|!=)/.test(normalizedAnswer)) return spec?.type === "zero-set" ? "zero-set" : "inequality";
  if (/奇函数|偶函数|非奇非偶|递增|递减/.test(normalizedAnswer)) return "concept-label";
  if (/没有|无/.test(normalizedAnswer)) return "zero-set";
  return "text";
}

function parseIntervalUnion(value) {
  const source = normalizeAnswer(value).replace(/[{}]/g, "");
  const intervals = [];
  const matcher = /([\[\(])([^,\]\)]+),([^,\]\)]+)([\]\)])/g;
  let match = matcher.exec(source);
  while (match) {
    intervals.push({
      start: parseNumber(match[2]),
      end: parseNumber(match[3]),
      startClosed: match[1] === "[",
      endClosed: match[4] === "]",
    });
    match = matcher.exec(source);
  }
  return intervals.length ? sortIntervals(intervals) : null;
}

function parseInequalitySet(value) {
  const source = normalizeAnswer(value).replace(/[{}]/g, "");
  const matches = [...source.matchAll(/x(>=|>|<=|<|=|!=)([+-]?\d+(?:\.\d+)?(?:\/\d+)?|[+-]?inf)/g)];
  if (!matches.length) return null;

  let intervals = [{ start: NEG_INF, end: INF, startClosed: false, endClosed: false }];
  for (const [, operator, rawNumber] of matches) {
    const number = parseNumber(rawNumber);
    if (operator === "=") {
      intervals = [{ start: number, end: number, startClosed: true, endClosed: true }];
    } else if (operator === ">=" || operator === ">") {
      intervals = intersectIntervals(intervals, [{ start: number, end: INF, startClosed: operator === ">=", endClosed: false }]);
    } else if (operator === "<=" || operator === "<") {
      intervals = intersectIntervals(intervals, [{ start: NEG_INF, end: number, startClosed: false, endClosed: operator === "<=" }]);
    } else if (operator === "!=") {
      intervals = excludePoint(intervals, number);
    }
  }
  return sortIntervals(intervals);
}

function intersectIntervals(left, right) {
  const result = [];
  for (const a of left) {
    for (const b of right) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (start > end) continue;
      const startClosed = start === a.start ? a.startClosed : b.startClosed;
      const endClosed = end === a.end ? a.endClosed : b.endClosed;
      if (start === end && (!startClosed || !endClosed)) continue;
      result.push({ start, end, startClosed, endClosed });
    }
  }
  return result;
}

function excludePoint(intervals, point) {
  const result = [];
  for (const interval of intervals) {
    if (!containsPoint(interval, point)) {
      result.push(interval);
      continue;
    }
    if (interval.start < point) {
      result.push({ start: interval.start, end: point, startClosed: interval.startClosed, endClosed: false });
    }
    if (point < interval.end) {
      result.push({ start: point, end: interval.end, startClosed: false, endClosed: interval.endClosed });
    }
  }
  return result;
}

function checkCondition(intervals, condition) {
  if (condition.type === "exclude") {
    const ok = !intervals.some((interval) => containsPoint(interval, condition.value));
    return {
      ok,
      evidence: ok ? "" : `答案仍然包含 ${condition.label.replace("≠", "=")}，但原式要求 ${condition.label}。`,
    };
  }
  if (condition.type === "lower") {
    const hasTooSmall = intervals.some((interval) => interval.start < condition.value);
    const includesBoundary = intervals.some((interval) => containsPoint(interval, condition.value));
    const ok = !hasTooSmall && (condition.inclusive ? includesBoundary : !includesBoundary);
    const evidence = hasTooSmall
      ? `答案缺少 ${condition.label} 这个限制条件，导致包含了不该出现的取值。`
      : condition.inclusive
        ? `答案误排除了边界 ${formatNumber(condition.value)}。`
        : `答案误包含了边界 ${formatNumber(condition.value)}。`;
    return {
      ok,
      evidence: ok ? "" : evidence,
    };
  }
  const hasTooLarge = intervals.some((interval) => interval.end > condition.value);
  const includesBoundary = intervals.some((interval) => containsPoint(interval, condition.value));
  const ok = !hasTooLarge && (condition.inclusive ? includesBoundary : !includesBoundary);
  const evidence = hasTooLarge
    ? `答案缺少 ${condition.label} 这个限制条件，导致包含了不该出现的取值。`
    : condition.inclusive
      ? `答案误排除了边界 ${formatNumber(condition.value)}。`
      : `答案误包含了边界 ${formatNumber(condition.value)}。`;
  return {
    ok,
    evidence: ok ? "" : evidence,
  };
}

function compareEndpointClosures(answerIntervals, expectedIntervals) {
  const extra = [];
  const evidence = [];
  for (const expected of expectedIntervals) {
    const sameBounds = answerIntervals.find((item) => item.start === expected.start && item.end === expected.end);
    if (!sameBounds) continue;
    if (sameBounds.startClosed !== expected.startClosed) {
      const label = `${sameBounds.startClosed ? "误包含" : "误排除"}左端点 ${formatNumber(expected.start)}`;
      extra.push(label);
      evidence.push(`${label}，端点开闭与参考答案不一致。`);
    }
    if (sameBounds.endClosed !== expected.endClosed) {
      const label = `${sameBounds.endClosed ? "误包含" : "误排除"}右端点 ${formatNumber(expected.end)}`;
      extra.push(label);
      evidence.push(`${label}，端点开闭与参考答案不一致。`);
    }
  }
  return { extra, evidence };
}

function pickIntervalMisconceptions({ missingConditions, extraConditions, evidence, spec }) {
  if (extraConditions.length) {
    return ["m-boundary"];
  }
  if (missingConditions.length) return [spec.defaultMisconceptionId];
  if (evidence.some((item) => item.includes("边界") || item.includes("端点"))) {
    return ["m-boundary"];
  }
  return [spec.defaultMisconceptionId];
}

function parseZeroValues(value) {
  const source = normalizeAnswer(value);
  if (/没有|无|no/.test(source)) return [];
  const values = [...source.matchAll(/x=([+-]?\d+(?:\.\d+)?(?:\/\d+)?)/g)].map((match) => parseNumber(match[1]));
  if (values.length) return [...new Set(values)].sort((a, b) => a - b);
  return [...source.matchAll(/(?<![\d/])-?\d+(?:\.\d+)?(?:\/\d+)?/g)]
    .map((match) => parseNumber(match[0]))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function parseConceptLabel(value) {
  if (value.includes("非奇非偶")) return "neither";
  if (value.includes("奇函数")) return "odd";
  if (value.includes("偶函数")) return "even";
  return null;
}

function containsCoordinatePoint(value) {
  return /\([+-]?\d+(?:\/\d+)?,0\)/.test(value);
}

function intervalsEqual(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  const a = sortIntervals(left);
  const b = sortIntervals(right);
  return a.every((interval, index) => {
    const other = b[index];
    return interval.start === other.start
      && interval.end === other.end
      && interval.startClosed === other.startClosed
      && interval.endClosed === other.endClosed;
  });
}

function numberArraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function containsPoint(interval, point) {
  const afterStart = point > interval.start || (point === interval.start && interval.startClosed);
  const beforeEnd = point < interval.end || (point === interval.end && interval.endClosed);
  return afterStart && beforeEnd;
}

function sortIntervals(intervals) {
  return [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
}

function intervalsToText(intervals) {
  return sortIntervals(intervals).map(formatInterval).join("∪");
}

function formatInterval(interval) {
  return `${interval.startClosed ? "[" : "("}${formatNumber(interval.start)},${formatNumber(interval.end)}${interval.endClosed ? "]" : ")"}`;
}

function parseNumber(value) {
  const source = String(value).replace("+", "");
  if (source === "inf") return INF;
  if (source === "-inf") return NEG_INF;
  if (source.includes("/")) {
    const [numerator, denominator] = source.split("/").map(Number);
    return numerator / denominator;
  }
  return Number(source);
}

function formatNumber(value) {
  if (value === INF) return "+∞";
  if (value === NEG_INF) return "-∞";
  return Number.isInteger(value) ? String(value) : String(value);
}
