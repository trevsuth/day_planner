self.onmessage = ({ data: { pattern, source, flags } }) => {
  try {
    if (new Set(flags).size !== flags.length) throw new Error("Each flag may only appear once.");
    const options = [...new Set(flags + "dg")].join("");
    const expression = new RegExp(pattern, options);
    const matches = [];
    const groupNames = Object.create(null);
    let truncated = false;
    for (const match of source.matchAll(expression)) {
      if (matches.length === 200) {
        truncated = true;
        break;
      }
      if (match.indices.length > 65) throw new Error("Use at most 64 capture groups.");
      const [[start, end], ...groups] = match.indices;
      for (const [name, span] of Object.entries(match.indices.groups ?? {})) {
        if (span) groupNames[name] = groups.indexOf(span) + 1;
      }
      matches.push({
        start, end,
        groups: groups.map((span) => span ? { start: span[0], end: span[1] } : null),
      });
    }
    self.postMessage({ matches, group_names: groupNames, truncated });
  } catch (error) {
    self.postMessage({ diagnostic: { message: error.message } });
  }
};
