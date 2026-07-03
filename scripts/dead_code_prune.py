#!/usr/bin/env python3
"""
Conservative JavaScript dead-code scanner/pruner for Graphitix.

The script intentionally removes only code that is very likely to be dead:
  1. top-level private function declarations / function-valued variables whose
     identifier has no token references anywhere else in the project and no raw
     string/HTML references outside the declaration itself;
  2. unreachable statements after return/throw inside the same braced block.

Default mode is report-only. Use --apply to write changes. Every changed JS file
is syntax-checked with `node --check`; on failure the file is restored and the
candidate is reported as rejected.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

JS_SUFFIXES = {".js", ".mjs", ".cjs"}
TEXT_SUFFIXES = JS_SUFFIXES | {".html", ".css", ".json", ".md", ".txt"}
IGNORE_DIRS = {"node_modules", ".git", "dist", "build", "coverage", ".next", ".vite"}
IGNORE_FILE_RE = re.compile(r"(?:^|/)(?:dead-code-report(?:[.-].*)?\.jsonl|dead-code-validation.*\.md)$")
IDENT_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")
KEYWORDS = {
    "break", "case", "catch", "class", "const", "continue", "debugger", "default",
    "delete", "do", "else", "export", "extends", "finally", "for", "function",
    "if", "import", "in", "instanceof", "let", "new", "return", "super", "switch",
    "this", "throw", "try", "typeof", "var", "void", "while", "with", "yield",
    "async", "await", "of", "static", "get", "set",
}
TERMINATORS = {"return", "throw"}
KEEP_MARKERS = (
    "dead-code:keep", "deadcode:keep", "dead-code keep", "@keep", "@public", "@api",
)
PUBLIC_NAME_RE = re.compile(
    r"^(?:init|setup|create|render|draw|mount|ensure|apply|update|load|save|export|import|on|handle|register|unregister|dispose|destroy)[A-Z_]"
)


@dataclasses.dataclass(frozen=True)
class Token:
    value: str
    start: int
    end: int
    depth: int


@dataclasses.dataclass
class Candidate:
    kind: str
    file: str
    start: int
    end: int
    start_line: int
    end_line: int
    name: str
    reason: str
    confidence: str = "safe"
    preview: str = ""

    def to_json(self) -> Dict[str, object]:
        return dataclasses.asdict(self)


def iter_files(root: Path, suffixes: Sequence[str]) -> Iterator[Path]:
    suffix_set = set(suffixes)
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        parts = set(path.relative_to(root).parts)
        if parts & IGNORE_DIRS:
            continue
        rel = str(path.relative_to(root)).replace(os.sep, "/")
        if IGNORE_FILE_RE.search(rel):
            continue
        if path.suffix.lower() in suffix_set:
            yield path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def line_no(text: str, pos: int) -> int:
    return text.count("\n", 0, max(0, pos)) + 1


def line_start(text: str, pos: int) -> int:
    return text.rfind("\n", 0, pos) + 1


def next_line_start(text: str, pos: int) -> int:
    idx = text.find("\n", pos)
    return len(text) if idx < 0 else idx + 1


def extend_to_statement_start(text: str, pos: int) -> int:
    start = line_start(text, pos)
    while start > 0:
        prev_end = start - 1
        prev_start = line_start(text, prev_end)
        prev = text[prev_start:prev_end].strip()
        if prev:
            break
        start = prev_start
    return start


def extend_to_statement_end(text: str, pos: int) -> int:
    end = pos
    # Include a following semicolon and same-line whitespace.
    while end < len(text) and text[end] in " \t\r\n":
        end += 1
    if end < len(text) and text[end] == ";":
        end += 1
    while end < len(text) and text[end] in " \t\r":
        end += 1
    if end < len(text) and text[end] == "\n":
        end += 1
    return end


def mask_js(text: str) -> str:
    """Replace JS comments and string/template bodies with spaces, preserving length.

    Template literals are masked whole. This makes the lexical pass conservative:
    references that exist only in template expressions are not counted as token
    references, but the later raw-reference guard still prevents deletion when a
    candidate name appears inside the template text.
    """
    chars = list(text)
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == "/" and i + 1 < n:
            nxt = text[i + 1]
            if nxt == "/":
                j = i + 2
                while j < n and text[j] not in "\r\n":
                    j += 1
                for k in range(i, j):
                    chars[k] = " "
                i = j
                continue
            if nxt == "*":
                j = i + 2
                while j + 1 < n and not (text[j] == "*" and text[j + 1] == "/"):
                    j += 1
                j = min(n, j + 2)
                for k in range(i, j):
                    if chars[k] not in "\r\n":
                        chars[k] = " "
                i = j
                continue
        if c in ('"', "'", "`"):
            quote = c
            j = i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == quote:
                    j += 1
                    break
                j += 1
            for k in range(i, min(j, n)):
                if chars[k] not in "\r\n":
                    chars[k] = " "
            i = j
            continue
        i += 1
    return "".join(chars)


def tokenize(masked: str) -> List[Token]:
    tokens: List[Token] = []
    depth = 0
    i = 0
    n = len(masked)
    while i < n:
        c = masked[i]
        if c.isspace():
            i += 1
            continue
        if c == "{":
            tokens.append(Token(c, i, i + 1, depth))
            depth += 1
            i += 1
            continue
        if c == "}":
            depth = max(0, depth - 1)
            tokens.append(Token(c, i, i + 1, depth))
            i += 1
            continue
        m = IDENT_RE.match(masked, i)
        if m:
            tokens.append(Token(m.group(0), m.start(), m.end(), depth))
            i = m.end()
            continue
        if c.isdigit():
            j = i + 1
            while j < n and re.match(r"[A-Za-z0-9_.]", masked[j]):
                j += 1
            tokens.append(Token(masked[i:j], i, j, depth))
            i = j
            continue
        # Keep punctuators simple; two-char arrows are useful for diagnostics.
        if masked.startswith("=>", i):
            tokens.append(Token("=>", i, i + 2, depth))
            i += 2
        else:
            tokens.append(Token(c, i, i + 1, depth))
            i += 1
    return tokens


def build_brace_pairs(tokens: Sequence[Token]) -> Dict[int, int]:
    stack: List[int] = []
    pairs: Dict[int, int] = {}
    for idx, tok in enumerate(tokens):
        if tok.value == "{":
            stack.append(idx)
        elif tok.value == "}" and stack:
            open_idx = stack.pop()
            pairs[open_idx] = idx
            pairs[idx] = open_idx
    return pairs


def find_matching_paren(masked: str, open_pos: int) -> Optional[int]:
    if open_pos < 0 or open_pos >= len(masked) or masked[open_pos] != "(":
        return None
    depth = 0
    i = open_pos
    while i < len(masked):
        c = masked[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def find_matching_brace(masked: str, open_pos: int) -> Optional[int]:
    if open_pos < 0 or open_pos >= len(masked) or masked[open_pos] != "{":
        return None
    depth = 0
    i = open_pos
    while i < len(masked):
        c = masked[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def find_statement_semicolon(masked: str, pos: int) -> Optional[int]:
    paren = bracket = brace = 0
    i = pos
    while i < len(masked):
        c = masked[i]
        if c == "(":
            paren += 1
        elif c == ")":
            paren = max(0, paren - 1)
        elif c == "[":
            bracket += 1
        elif c == "]":
            bracket = max(0, bracket - 1)
        elif c == "{":
            brace += 1
        elif c == "}":
            if paren == bracket == brace == 0:
                return None
            brace = max(0, brace - 1)
        elif c == ";" and paren == bracket == brace == 0:
            return i
        i += 1
    return None


def context_has_keep_marker(text: str, start: int) -> bool:
    prefix = text[max(0, start - 500):start].lower()
    return any(marker in prefix for marker in KEEP_MARKERS)


def raw_name_refs_outside(project_texts: Dict[Path, str], name: str, self_path: Path, start: int, end: int) -> List[Tuple[Path, int]]:
    pattern = re.compile(rf"(?<![A-Za-z0-9_$]){re.escape(name)}(?![A-Za-z0-9_$])")
    refs: List[Tuple[Path, int]] = []
    for path, text in project_texts.items():
        for m in pattern.finditer(text):
            if path == self_path and start <= m.start() < end:
                continue
            refs.append((path, m.start()))
            if len(refs) > 10:
                return refs
    return refs


def identifier_counts_by_file(js_masks: Dict[Path, str]) -> Counter:
    counts: Counter = Counter()
    for masked in js_masks.values():
        for m in IDENT_RE.finditer(masked):
            value = m.group(0)
            if value not in KEYWORDS:
                counts[value] += 1
    return counts


def identifier_count_outside(js_masks: Dict[Path, str], name: str, self_path: Path, start: int, end: int) -> int:
    count = 0
    for path, masked in js_masks.items():
        for m in re.finditer(rf"(?<![A-Za-z0-9_$]){re.escape(name)}(?![A-Za-z0-9_$])", masked):
            if path == self_path and start <= m.start() < end:
                continue
            count += 1
    return count




def build_identifier_positions(js_masks: Dict[Path, str]) -> Dict[str, List[Tuple[Path, int]]]:
    positions: Dict[str, List[Tuple[Path, int]]] = defaultdict(list)
    for path, masked in js_masks.items():
        for m in IDENT_RE.finditer(masked):
            value = m.group(0)
            if value not in KEYWORDS:
                positions[value].append((path, m.start()))
    return positions


def count_positions_outside(positions: Sequence[Tuple[Path, int]], self_path: Path, start: int, end: int) -> int:
    return sum(1 for path, pos in positions if not (path == self_path and start <= pos < end))




def build_raw_identifier_positions(project_texts: Dict[Path, str]) -> Dict[str, List[Tuple[Path, int]]]:
    positions: Dict[str, List[Tuple[Path, int]]] = defaultdict(list)
    for path, text in project_texts.items():
        for m in IDENT_RE.finditer(text):
            positions[m.group(0)].append((path, m.start()))
    return positions

def raw_positions_for_name(project_texts: Dict[Path, str], name: str) -> List[Tuple[Path, int]]:
    pattern = re.compile(rf"(?<![A-Za-z0-9_$]){re.escape(name)}(?![A-Za-z0-9_$])")
    out: List[Tuple[Path, int]] = []
    for path, text in project_texts.items():
        out.extend((path, m.start()) for m in pattern.finditer(text))
    return out

def top_level_function_candidates(root: Path, js_masks: Dict[Path, str], project_texts: Dict[Path, str]) -> List[Candidate]:
    candidates: List[Candidate] = []
    id_positions = build_identifier_positions(js_masks)
    raw_positions = build_raw_identifier_positions(project_texts)
    for path, masked in js_masks.items():
        rel = str(path.relative_to(root)).replace(os.sep, "/")
        text = project_texts[path]
        tokens = tokenize(masked)
        # Function declarations.
        for m in re.finditer(r"(?:(?:async)\s+)?function\s*\*?\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(", masked):
            name = m.group(1)
            if PUBLIC_NAME_RE.match(name) or context_has_keep_marker(text, m.start()):
                continue
            # A removable function declaration must start its own statement.
            # Named function expressions (`obj.x = function named(){}` or
            # `fallback || function named(){}`) are executable values even when the
            # debug name itself is unreferenced, so they must never be removed.
            line_prefix = masked[line_start(masked, m.start()):m.start()].strip()
            if line_prefix:
                continue
            if re.search(r"\bexport\s+(?:default\s+)?$", masked[max(0, m.start() - 40):m.start()]):
                continue
            open_paren = masked.find("(", m.end(1))
            close_paren = find_matching_paren(masked, open_paren)
            if close_paren is None:
                continue
            open_brace = masked.find("{", close_paren)
            close_brace = find_matching_brace(masked, open_brace)
            if open_brace < 0 or close_brace is None:
                continue
            start = m.start()
            end = close_brace + 1
            if line_no(text, end) - line_no(text, start) > 300:
                # Without a full parser, very large spans usually mean a regex or
                # template literal confused brace matching. Prefer a false negative
                # over deleting across unrelated code.
                continue
            if count_positions_outside(id_positions.get(name, []), path, start, end) != 0:
                continue
            if count_positions_outside(raw_positions.get(name, []), path, start, end) != 0:
                continue
            preview = text[start:min(end, start + 220)].strip().splitlines()[0][:200]
            candidates.append(Candidate(
                kind="unused-function",
                file=rel,
                start=start,
                end=end,
                start_line=line_no(text, start),
                end_line=line_no(text, end),
                name=name,
                reason="top-level private function has no identifier or raw-string references outside its own declaration",
                preview=preview,
            ))
        # Function-valued top-level variables. Skip exported vars and public-looking names.
        var_re = re.compile(r"\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:(?:async\s+)?function\b|(?:async\s*)?\([^;{}]*\)\s*=>|(?:async\s+)?[A-Za-z_$][A-Za-z0-9_$]*\s*=>)")
        for m in var_re.finditer(masked):
            name = m.group(1)
            if PUBLIC_NAME_RE.match(name) or context_has_keep_marker(text, m.start()):
                continue
            start_token = next((t for t in tokens if t.start >= m.start()), None)
            if not start_token:
                continue
            if re.search(r"\bexport\s+$", masked[max(0, m.start() - 40):m.start()]):
                continue
            matched_initializer = masked[m.start():m.end()]
            cursor = m.end()
            if "function" in matched_initializer:
                fn_paren = masked.find("(", cursor)
                if fn_paren < 0:
                    continue
                fn_paren_end = find_matching_paren(masked, fn_paren)
                if fn_paren_end is None:
                    continue
                cursor = fn_paren_end + 1
            while cursor < len(masked) and masked[cursor].isspace():
                cursor += 1
            if cursor >= len(masked) or masked[cursor] != "{":
                # Expression-bodied arrows are intentionally skipped; semicolons
                # inside regex literals or ternaries are too easy to misread
                # without a full JavaScript parser.
                continue
            body_start = cursor
            body_end = find_matching_brace(masked, body_start)
            if body_end is None:
                continue
            semi = find_statement_semicolon(masked, body_end + 1)
            if semi is None:
                continue
            start = m.start()
            end = semi + 1
            if line_no(text, end) - line_no(text, start) > 300:
                # Without a full parser, very large spans usually mean a regex or
                # template literal confused brace matching. Prefer a false negative
                # over deleting across unrelated code.
                continue
            if count_positions_outside(id_positions.get(name, []), path, start, end) != 0:
                continue
            if count_positions_outside(raw_positions.get(name, []), path, start, end) != 0:
                continue
            preview = text[start:min(end, start + 220)].strip().splitlines()[0][:200]
            candidates.append(Candidate(
                kind="unused-function-variable",
                file=rel,
                start=start,
                end=end,
                start_line=line_no(text, start),
                end_line=line_no(text, end),
                name=name,
                reason="top-level private function-valued variable has no identifier or raw-string references outside its own declaration",
                preview=preview,
            ))
    return candidates


def unreachable_after_terminator_candidates(root: Path, js_masks: Dict[Path, str], project_texts: Dict[Path, str]) -> List[Candidate]:
    candidates: List[Candidate] = []
    for path, masked in js_masks.items():
        rel = str(path.relative_to(root)).replace(os.sep, "/")
        text = project_texts[path]
        tokens = tokenize(masked)
        pairs = build_brace_pairs(tokens)
        by_start = {tok.start: idx for idx, tok in enumerate(tokens)}
        for idx, tok in enumerate(tokens):
            if tok.value not in TERMINATORS:
                continue
            # Only handle terminators that are standalone statements in the current
            # block. A braceless one-liner such as `if (x) return y;` is not a
            # block terminator for the surrounding block, so deleting everything
            # after it would be catastrophic.
            if masked[line_start(masked, tok.start):tok.start].strip():
                continue
            # Find nearest enclosing braced block.
            open_idx = None
            for j in range(idx - 1, -1, -1):
                if tokens[j].value == "{" and tokens[j].depth < tok.depth and pairs.get(j, -1) > idx:
                    open_idx = j
                    break
            if open_idx is None:
                continue
            close_idx = pairs.get(open_idx)
            if close_idx is None or close_idx <= idx:
                continue
            block_depth = tokens[open_idx].depth + 1
            if tok.depth != block_depth:
                continue
            semi = find_statement_semicolon(masked, tok.end)
            if semi is None or semi >= tokens[close_idx].start:
                continue
            # Tokens after terminator before closing brace.
            trailing = [t for t in tokens[idx + 1:close_idx] if t.start > semi]
            if not trailing:
                continue
            # Avoid switch case fall-through areas and labels.
            if any(t.value in {"case", "default"} and t.depth == block_depth for t in trailing):
                continue
            # Skip if trailing content is only comments/whitespace in raw source.
            delete_start = next_line_start(text, semi + 1)
            delete_end = line_start(text, tokens[close_idx].start)
            if delete_start >= delete_end:
                continue
            raw_segment = text[delete_start:delete_end]
            masked_segment = masked[delete_start:delete_end]
            if not IDENT_RE.search(masked_segment) and not re.search(r"[{}();=+\-*/]", masked_segment):
                continue
            # Avoid removing declarations that may be intentionally left under dev comments.
            preview_lines = [ln.strip() for ln in raw_segment.strip().splitlines() if ln.strip()]
            preview = preview_lines[0][:200] if preview_lines else ""
            candidates.append(Candidate(
                kind="unreachable-block",
                file=rel,
                start=delete_start,
                end=delete_end,
                start_line=line_no(text, delete_start),
                end_line=max(line_no(text, delete_end), line_no(text, delete_start)),
                name=f"after-{tok.value}",
                reason=f"statements after `{tok.value}` in the same braced block cannot execute before the block closes",
                preview=preview,
            ))
    return candidates


def dedupe_candidates(candidates: Iterable[Candidate]) -> List[Candidate]:
    seen = set()
    out = []
    for c in sorted(candidates, key=lambda x: (x.file, x.start, x.end, x.kind)):
        key = (c.file, c.start, c.end, c.kind)
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def scan(root: Path) -> List[Candidate]:
    project_texts = {p: read_text(p) for p in iter_files(root, TEXT_SUFFIXES)}
    js_texts = {p: project_texts[p] for p in iter_files(root, JS_SUFFIXES)}
    js_masks = {p: mask_js(text) for p, text in js_texts.items()}
    candidates = []
    candidates.extend(top_level_function_candidates(root, js_masks, project_texts))
    candidates.extend(unreachable_after_terminator_candidates(root, js_masks, project_texts))
    return dedupe_candidates(candidates)


def node_check(path: Path) -> Tuple[bool, str]:
    try:
        proc = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        return True, "node not available; syntax validation skipped"
    except subprocess.TimeoutExpired:
        return False, "node --check timed out"
    ok = proc.returncode == 0
    return ok, (proc.stdout + proc.stderr).strip()


def apply_candidates(root: Path, candidates: Sequence[Candidate], kinds: Optional[set[str]] = None) -> List[Dict[str, object]]:
    results: List[Dict[str, object]] = []
    by_file: Dict[str, List[Candidate]] = defaultdict(list)
    for c in candidates:
        if kinds and c.kind not in kinds:
            continue
        by_file[c.file].append(c)
    for rel, file_candidates in by_file.items():
        path = root / rel
        original = read_text(path)
        text = original
        applied: List[Candidate] = []
        for c in sorted(file_candidates, key=lambda x: x.start, reverse=True):
            text = text[:c.start] + text[c.end:]
            applied.append(c)
        backup = path.with_suffix(path.suffix + ".deadcode.bak")
        backup.write_text(original, encoding="utf-8")
        path.write_text(text, encoding="utf-8")
        ok, message = node_check(path)
        if not ok:
            path.write_text(original, encoding="utf-8")
            results.append({"file": rel, "applied": 0, "reverted": True, "error": message})
        else:
            backup.unlink(missing_ok=True)
            results.append({"file": rel, "applied": len(applied), "reverted": False, "validator": message})
    return results


def write_report(path: Path, candidates: Sequence[Candidate]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        for c in candidates:
            fh.write(json.dumps(c.to_json(), ensure_ascii=False) + "\n")


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Conservative Graphitix JS dead-code scanner/pruner")
    parser.add_argument("--root", default=".", help="Project root to scan")
    parser.add_argument("--report", default="dead-code-report.jsonl", help="JSONL report path")
    parser.add_argument("--apply", action="store_true", help="Apply safe deletions after reporting")
    parser.add_argument("--repeat", action="store_true", help="When applying, repeat scan/apply passes until no safe candidates remain")
    parser.add_argument("--max-passes", type=int, default=8, help="Maximum repeated apply passes")
    parser.add_argument("--kind", action="append", choices=["unused-function", "unused-function-variable", "unreachable-block"], help="Restrict apply/report to candidate kind; repeatable")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    report = Path(args.report)
    if not report.is_absolute():
        report = root / report
    allowed = set(args.kind) if args.kind else None

    all_apply_results: List[Dict[str, object]] = []
    pass_index = 0
    while True:
        pass_index += 1
        candidates = scan(root)
        if allowed:
            candidates = [c for c in candidates if c.kind in allowed]
        pass_report = report if pass_index == 1 else report.with_name(f"{report.stem}.pass{pass_index}{report.suffix}")
        write_report(pass_report, candidates)
        summary = Counter(c.kind for c in candidates)
        print(json.dumps({
            "root": str(root),
            "pass": pass_index,
            "candidates": len(candidates),
            "by_kind": dict(summary),
            "report": str(pass_report)
        }, indent=2))
        if not args.apply or not candidates:
            break
        results = apply_candidates(root, candidates, allowed)
        all_apply_results.extend({**r, "pass": pass_index} for r in results)
        print(json.dumps({"apply_results": results}, indent=2))
        if any(r.get("reverted") for r in results):
            return 2
        if not args.repeat or pass_index >= max(1, args.max_passes):
            break
    if all_apply_results:
        print(json.dumps({"all_apply_results": all_apply_results}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
