import type { ImportedTestCaseRow } from "./testCaseImport";

type ParsedJUnitXml = {
  rows: ImportedTestCaseRow[];
  warnings: string[];
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength = 220) => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

const readSuiteName = (node: Element) => {
  let current: Element | null = node.parentElement;

  while (current) {
    if (current.tagName.toLowerCase() === "testsuite") {
      return collapseWhitespace(current.getAttribute("name") || "");
    }

    current = current.parentElement;
  }

  return "";
};

const readSuitePath = (node: Element) => {
  const names: string[] = [];
  let current: Element | null = node.parentElement;

  while (current) {
    if (current.tagName.toLowerCase() === "testsuite") {
      const suiteName = collapseWhitespace(current.getAttribute("name") || "");

      if (suiteName && !names.includes(suiteName)) {
        names.unshift(suiteName);
      }
    }

    current = current.parentElement;
  }

  return names;
};

const readProperties = (node: Element | null) => {
  if (!node) {
    return {};
  }

  const propertiesNode = Array.from(node.children).find((child) => child.tagName.toLowerCase() === "properties");

  if (!propertiesNode) {
    return {};
  }

  return Array.from(propertiesNode.children)
    .filter((child) => child.tagName.toLowerCase() === "property")
    .reduce<Record<string, string>>((next, propertyNode) => {
      const name = collapseWhitespace(propertyNode.getAttribute("name") || "");

      if (!name) {
        return next;
      }

      next[name.replace(/^@+/, "").toLowerCase()] = collapseWhitespace(
        propertyNode.getAttribute("value") || propertyNode.textContent || ""
      );
      return next;
    }, {});
};

const readInheritedSuiteProperties = (node: Element) => {
  const merged: Record<string, string> = {};
  const suiteNodes: Element[] = [];
  let current: Element | null = node.parentElement;

  while (current) {
    if (current.tagName.toLowerCase() === "testsuite") {
      suiteNodes.unshift(current);
    }

    current = current.parentElement;
  }

  suiteNodes.forEach((suiteNode) => {
    Object.assign(merged, readProperties(suiteNode));
  });

  return merged;
};

export function parseJUnitXmlTestCases(text: string): ParsedJUnitXml {
  const parser = new DOMParser();
  const document = parser.parseFromString(text, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    return {
      rows: [],
      warnings: ["The XML file could not be parsed as a valid JUnit report."]
    };
  }

  const testcaseNodes = Array.from(document.getElementsByTagName("testcase"));

  if (!testcaseNodes.length) {
    return {
      rows: [],
      warnings: ["No <testcase> nodes were found in the selected JUnit XML report."]
    };
  }

  const rows = testcaseNodes.map((node, index) => {
    const name = collapseWhitespace(node.getAttribute("name") || "") || `JUnit test ${index + 1}`;
    const className = collapseWhitespace(node.getAttribute("classname") || "");
    const suiteName = readSuiteName(node);
    const suitePath = readSuitePath(node);
    const runtimeSeconds = collapseWhitespace(node.getAttribute("time") || "");
    const inheritedProperties = readInheritedSuiteProperties(node);
    const caseProperties = readProperties(node);
    const failureNode = Array.from(node.children).find((child) => {
      const tag = child.tagName.toLowerCase();
      return tag === "failure" || tag === "error";
    });
    const skippedNode = Array.from(node.children).find((child) => child.tagName.toLowerCase() === "skipped");
    const reportNote = collapseWhitespace(
      [
        failureNode?.getAttribute("message") || "",
        failureNode?.textContent || "",
        skippedNode?.getAttribute("message") || "",
        skippedNode?.textContent || ""
      ]
        .filter(Boolean)
        .join(" ")
    );
    const title = className && className !== name ? `${className} :: ${name}` : name;
    const detailParts = [
      "Imported from a JUnit XML report.",
      suiteName ? `Suite: ${suiteName}.` : "",
      className ? `Class: ${className}.` : "",
      runtimeSeconds ? `Runtime: ${runtimeSeconds}s.` : "",
      failureNode ? "Source result: failed." : skippedNode ? "Source result: skipped." : "Source result: passed."
    ].filter(Boolean);

    return {
      title,
      description: collapseWhitespace(
        [detailParts.join(" "), reportNote ? `Report note: ${truncate(reportNote)}` : ""].filter(Boolean).join(" ")
      ),
      automated: "yes",
      status: "draft",
      suites: suitePath.join("\n"),
      parameter_values: {
        ...inheritedProperties,
        ...caseProperties
      },
      action: `Run automated JUnit test ${title}.`,
      expected_result: "The automated JUnit test completes without failures or errors."
    } satisfies ImportedTestCaseRow;
  });

  return {
    rows,
    warnings: []
  };
}
