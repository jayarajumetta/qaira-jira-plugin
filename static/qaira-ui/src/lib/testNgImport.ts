import type { ImportedTestCaseRow } from "./testCaseImport";

type ParsedTestNgXml = {
  rows: ImportedTestCaseRow[];
  warnings: string[];
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeParameterName = (value: string) =>
  value
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

const readParameterMap = (node: Element | null) => {
  if (!node) {
    return {};
  }

  return Array.from(node.children)
    .filter((child) => child.tagName.toLowerCase() === "parameter")
    .reduce<Record<string, string>>((next, child) => {
      const name = normalizeParameterName(child.getAttribute("name") || "");

      if (!name) {
        return next;
      }

      next[name] = collapseWhitespace(child.getAttribute("value") || child.textContent || "");
      return next;
    }, {});
};

const parseTestNgSuiteDefinition = (document: XMLDocument) => {
  const suiteNodes = Array.from(document.getElementsByTagName("suite"));

  if (!suiteNodes.length) {
    return [];
  }

  const rows: ImportedTestCaseRow[] = [];

  suiteNodes.forEach((suiteNode) => {
    const suiteName = collapseWhitespace(suiteNode.getAttribute("name") || "");
    const suiteParameters = readParameterMap(suiteNode);
    const testNodes = Array.from(suiteNode.children).filter((child) => child.tagName.toLowerCase() === "test");

    testNodes.forEach((testNode, testIndex) => {
      const testName = collapseWhitespace(testNode.getAttribute("name") || "") || `Test ${testIndex + 1}`;
      const testParameters = { ...suiteParameters, ...readParameterMap(testNode) };
      const classNodes = Array.from(testNode.getElementsByTagName("class"));

      classNodes.forEach((classNode) => {
        const className = collapseWhitespace(classNode.getAttribute("name") || "");
        const classParameters = { ...testParameters, ...readParameterMap(classNode) };
        const methodsNode = Array.from(classNode.children).find((child) => child.tagName.toLowerCase() === "methods");
        const includeNodes = methodsNode
          ? Array.from(methodsNode.children).filter((child) => child.tagName.toLowerCase() === "include")
          : [];

        if (!includeNodes.length) {
          const title = className ? `${className} :: ${testName}` : testName;

          rows.push({
            title,
            description: collapseWhitespace(
              [
                "Imported from a TestNG suite definition.",
                suiteName ? `Suite: ${suiteName}.` : "",
                `Test: ${testName}.`,
                className ? `Class: ${className}.` : ""
              ].filter(Boolean).join(" ")
            ),
            automated: "yes",
            status: "draft",
            suite: suiteName,
            parameter_values: classParameters,
            action: `Run automated TestNG test ${title}.`,
            expected_result: "The automated TestNG test completes without failures."
          });
          return;
        }

        includeNodes.forEach((includeNode, includeIndex) => {
          const methodName = collapseWhitespace(includeNode.getAttribute("name") || "") || `Method ${includeIndex + 1}`;
          const title = className ? `${className} :: ${methodName}` : methodName;

          rows.push({
            title,
            description: collapseWhitespace(
              [
                "Imported from a TestNG suite definition.",
                suiteName ? `Suite: ${suiteName}.` : "",
                `Test: ${testName}.`,
                className ? `Class: ${className}.` : "",
                `Method: ${methodName}.`
              ].filter(Boolean).join(" ")
            ),
            automated: "yes",
            status: "draft",
            suite: suiteName,
            parameter_values: classParameters,
            action: `Run automated TestNG test ${title}.`,
            expected_result: "The automated TestNG test completes without failures."
          });
        });
      });
    });
  });

  return rows;
};

const parseTestNgResultsDocument = (document: XMLDocument) => {
  const suiteNodes = Array.from(document.getElementsByTagName("suite"));

  if (!suiteNodes.length) {
    return [];
  }

  const rows: ImportedTestCaseRow[] = [];

  suiteNodes.forEach((suiteNode) => {
    const suiteName = collapseWhitespace(suiteNode.getAttribute("name") || "");
    const testNodes = Array.from(suiteNode.getElementsByTagName("test"));

    testNodes.forEach((testNode, testIndex) => {
      const testName = collapseWhitespace(testNode.getAttribute("name") || "") || `Test ${testIndex + 1}`;
      const classNodes = Array.from(testNode.getElementsByTagName("class"));

      classNodes.forEach((classNode) => {
        const className = collapseWhitespace(classNode.getAttribute("name") || "");
        const methodNodes = Array.from(classNode.getElementsByTagName("test-method")).filter(
          (methodNode) => methodNode.getAttribute("is-config") !== "true"
        );

        methodNodes.forEach((methodNode, methodIndex) => {
          const methodName = collapseWhitespace(methodNode.getAttribute("name") || "") || `Method ${methodIndex + 1}`;
          const status = collapseWhitespace(methodNode.getAttribute("status") || "").toLowerCase();
          const title = className ? `${className} :: ${methodName}` : methodName;
          const paramsNode = Array.from(methodNode.children).find((child) => child.tagName.toLowerCase() === "params");
          const parameterValues = paramsNode
            ? Array.from(paramsNode.children)
                .filter((child) => child.tagName.toLowerCase() === "param")
                .reduce<Record<string, string>>((next, paramNode) => {
                  const name = normalizeParameterName(paramNode.getAttribute("name") || "");

                  if (!name) {
                    return next;
                  }

                  next[name] = collapseWhitespace(paramNode.getAttribute("value") || paramNode.textContent || "");
                  return next;
                }, {})
            : {};

          rows.push({
            title,
            description: collapseWhitespace(
              [
                "Imported from a TestNG results report.",
                suiteName ? `Suite: ${suiteName}.` : "",
                `Test: ${testName}.`,
                className ? `Class: ${className}.` : "",
                `Source result: ${status || "unknown"}.`
              ].filter(Boolean).join(" ")
            ),
            automated: "yes",
            status: "draft",
            suite: suiteName,
            parameter_values: parameterValues,
            action: `Run automated TestNG test ${title}.`,
            expected_result:
              status === "failed"
                ? "The automated TestNG test should complete successfully without reproducing the reported failure."
                : "The automated TestNG test completes without failures."
          });
        });
      });
    });
  });

  return rows;
};

export function parseTestNgXmlTestCases(text: string): ParsedTestNgXml {
  const parser = new DOMParser();
  const document = parser.parseFromString(text, "application/xml");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    return {
      rows: [],
      warnings: ["The XML file could not be parsed as a valid TestNG document."]
    };
  }

  const rootTag = document.documentElement.tagName.toLowerCase();
  const rows =
    rootTag === "testng-results"
      ? parseTestNgResultsDocument(document)
      : rootTag === "suite"
        ? parseTestNgSuiteDefinition(document)
        : [];

  if (!rows.length) {
    return {
      rows: [],
      warnings: ["No importable TestNG tests were found in the selected XML file."]
    };
  }

  return {
    rows,
    warnings: []
  };
}
