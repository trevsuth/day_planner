import { useState } from "react";
import { calculateIntegers, convertBase64, numberBases, parseInteger } from "../domain/calculator";
import { analyzeSubnet, splitSubnet } from "../domain/subnet";

function useCalculation() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  function clear() {
    setResult(null);
    setError("");
  }
  function run(event, calculate) {
    event.preventDefault();
    clear();
    try {
      setResult(calculate());
    } catch (failure) {
      setError(failure.message);
    }
  }
  return { result, error, clear, run };
}

function Results({ results }) {
  return results && <dl className="calculator-results" aria-live="polite">
    {results.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><code>{value}</code></dd></div>)}
  </dl>;
}

function CalculatorInput({ label, radix, name = "value" }) {
  return <div className="validation-controls">
    <label>{label} <input name={name} required maxLength={4099} spellCheck={false} /></label>
    <label>{radix === "left" ? "Input base" : "Second input base"}{" "}
      <select name={radix} defaultValue="10">
        {numberBases.map((base) => <option key={base.radix} value={base.radix}>{base.name}</option>)}
      </select>
    </label>
  </div>;
}

const operations = [
  ["convert", "Convert"], ["add", "Add"], ["subtract", "Subtract"], ["multiply", "Multiply"],
  ["divide", "Integer divide"], ["remainder", "Remainder"], ["and", "Bitwise AND"],
  ["or", "Bitwise OR"], ["xor", "Bitwise XOR"],
];

function NumberCalculator() {
  const [operation, setOperation] = useState("convert");
  const calculation = useCalculation();
  return <>
    <form className="calculator-form" onChange={calculation.clear} onSubmit={(event) => {
      const fields = new FormData(event.currentTarget);
      calculation.run(event, () => {
        const left = parseInteger(fields.get("value"), Number(fields.get("left")));
        const value = operation === "convert" ? left :
          calculateIntegers(left, parseInteger(fields.get("other"), Number(fields.get("right"))), operation);
        return numberBases.map(({ radix, name }) => [name, value.toString(radix).toUpperCase()]);
      });
    }}>
      <CalculatorInput label="Integer" radix="left" />
      <label>Operation{" "}
        <select value={operation} onChange={(event) => setOperation(event.target.value)}>
          {operations.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {operation !== "convert" && <CalculatorInput label="Second integer" radix="right" name="other" />}
      <button type="submit" className="secondary-button">{operation === "convert" ? "Convert bases" : "Calculate"}</button>
    </form>
    {calculation.error && <p role="alert">{calculation.error}</p>}
    <Results results={calculation.result} />
  </>;
}

function Base64Calculator() {
  const calculation = useCalculation();
  const [copyStatus, setCopyStatus] = useState("");
  return <>
    <form className="calculator-form" onChange={() => { calculation.clear(); setCopyStatus(""); }} onSubmit={(event) => {
      const fields = new FormData(event.currentTarget);
      setCopyStatus("");
      calculation.run(event, () => convertBase64(
        fields.get("source"), fields.get("direction"), fields.get("format"), fields.has("url-safe"),
      ));
    }}>
      <div className="validation-controls">
        <label>Direction <select name="direction"><option value="encode">Encode</option><option value="decode">Decode</option></select></label>
        <label>Byte representation <select name="format"><option value="text">UTF-8 text</option><option value="hex">Hex bytes</option></select></label>
        <label><input type="checkbox" name="url-safe" /> URL-safe Base64</label>
      </div>
      <label className="validation-editor">Base64 tool input<textarea name="source" spellCheck={false} maxLength={100000} /></label>
      <button className="secondary-button" type="submit">Convert Base64</button>
    </form>
    {calculation.error && <p role="alert">{calculation.error}</p>}
    {calculation.result !== null && <>
      <label className="validation-editor">Base64 tool output<textarea readOnly value={calculation.result} /></label>
      <div className="validation-controls">
        <button className="secondary-button" type="button" onClick={async () => {
          try {
            await navigator.clipboard.writeText(calculation.result);
            setCopyStatus("Copied.");
          } catch {
            setCopyStatus("Select the output text to copy it.");
          }
        }}>Copy output</button>
        <span role="status">{copyStatus}</span>
      </div>
    </>}
  </>;
}

function SubnetCalculator() {
  const calculation = useCalculation();
  return <>
    <form className="calculator-form" onChange={calculation.clear} onSubmit={(event) => {
      const fields = new FormData(event.currentTarget);
      calculation.run(event, () => analyzeSubnet(fields.get("cidr"), fields.get("candidate")));
    }}>
      <label>Address and CIDR prefix <input name="cidr" required spellCheck={false} maxLength={64} placeholder="192.168.1.35/24" /></label>
      <label>Check address membership <input name="candidate" spellCheck={false} maxLength={64} placeholder="Optional, e.g. 192.168.1.50" /></label>
      <button type="submit" className="secondary-button">Calculate subnet</button>
    </form>
    {calculation.error && <p role="alert">{calculation.error}</p>}
    <Results results={calculation.result} />
  </>;
}

function SubnetSplitter() {
  const calculation = useCalculation();
  const [page, setPage] = useState("1");
  const { result } = calculation;
  return <section>
    <h2>Split a subnet</h2>
    <form className="calculator-form" onSubmit={(event) => {
      const fields = new FormData(event.currentTarget);
      calculation.run(event, () => splitSubnet(fields.get("parent"), fields.get("prefix"), page));
    }}>
      <div className="validation-controls" onChange={() => { calculation.clear(); setPage("1"); }}>
        <label>Parent subnet <input name="parent" required maxLength={64} spellCheck={false} placeholder="192.168.1.0/24" /></label>
        <label>Child prefix <input name="prefix" required maxLength={4} inputMode="numeric" placeholder="26" /></label>
      </div>
      <div className="validation-controls">
        <label>Page <input required maxLength={39} inputMode="numeric" value={page}
          onChange={(event) => setPage(event.target.value)} /></label>
        <button type="submit" className="secondary-button">Split subnet</button>
      </div>
    </form>
    {calculation.error && <p role="alert">{calculation.error}</p>}
    {result && <>
      <p role="status">{result.total.toString()} subnets, {result.childSize.toString()} addresses per subnet.
        {" "}Page {result.page.toString()} of {result.pages.toString()}.</p>
      <label className="validation-editor">Child subnets<textarea rows={Math.min(12, result.cidrs.length)}
        readOnly value={result.cidrs.join("\n")} /></label>
    </>}
  </section>;
}

const tools = [
  { id: "numbers", label: "Number Bases", Panel: NumberCalculator },
  { id: "base64", label: "Base64", Panel: Base64Calculator },
  { id: "subnet", label: "IP Subnet", Panel: () => <><SubnetCalculator /><SubnetSplitter /></> },
];

export function CalculatorApp() {
  const [active, setActive] = useState("numbers");
  return <section className="validation api-panel">
    <h1>Calculator</h1>
    <nav className="validation-controls" aria-label="Calculator tools">
      {tools.map(({ id, label }) => <button key={id} className="secondary-button" type="button"
        aria-pressed={active === id} onClick={() => setActive(id)}>{label}</button>)}
    </nav>
    {tools.map(({ id, Panel }) => <div key={id} className="validation-tool" hidden={active !== id}><Panel /></div>)}
  </section>;
}
