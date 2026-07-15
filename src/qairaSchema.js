export default {
  "schemaVersion": "2.0.0",
  "prefix": "Qaira",
  "productName": "Qaira - AI Test Management for Jira",
  "storagePolicy": "jira-only-no-external-db-no-forge-db",
  "issueTypes": [
    {
      "key": "testCase",
      "name": "Qaira Test Case",
      "description": "Reusable Jira-native QA test specification. Steps are stored as Jira issue properties or attachments, not as child issues.",
      "screenTabs": [
        "Core",
        "Design",
        "Automation",
        "AI & Metrics"
      ]
    },
    {
      "key": "testSuite",
      "name": "Qaira Test Suite",
      "description": "Reusable static, dynamic-JQL, or smart-AI group of Qaira Test Cases.",
      "screenTabs": [
        "Core",
        "Scope",
        "AI & Metrics"
      ]
    },
    {
      "key": "testPlan",
      "name": "Qaira Test Plan",
      "description": "Release, sprint, milestone, compliance, or risk-based testing plan.",
      "screenTabs": [
        "Core",
        "Scope",
        "Execution",
        "Release Risk"
      ]
    },
    {
      "key": "testRun",
      "name": "Qaira Test Run",
      "description": "Manual, automated, hybrid, or imported execution batch header. Result rows live in properties/attachments.",
      "screenTabs": [
        "Core",
        "Execution",
        "CI & Evidence",
        "AI Triage"
      ]
    },
    {
      "key": "automationAsset",
      "name": "Qaira Automation Asset",
      "description": "Jira-owned mapping between Qaira Test Cases and external automation code/assets.",
      "screenTabs": [
        "Core",
        "Repository",
        "Quality",
        "AI"
      ]
    },
    {
      "key": "objectRepositoryItem",
      "name": "Qaira Object Repository Item",
      "description": "Jira-owned object repository for HTML locators, mobile locators, API endpoints, contracts, reusable actions, and assertions.",
      "screenTabs": [
        "Core",
        "Locator",
        "Usage",
        "AI Healing"
      ]
    },
    {
      "key": "testDataSet",
      "name": "Qaira Test Data Set",
      "description": "Reusable masked/synthetic test data metadata. Do not store secrets or real private data.",
      "screenTabs": [
        "Core",
        "Governance",
        "Usage"
      ]
    },
    {
      "key": "qualityGate",
      "name": "Qaira Quality Gate",
      "description": "Formal Jira-native QA release readiness and risk acceptance gate.",
      "screenTabs": [
        "Core",
        "Release Metrics",
        "Approval",
        "AI Summary"
      ]
    }
  ],
  "requirementIssueTypeNames": [
    "Story"
  ],
  "defectIssueTypeNames": [
    "Bug"
  ],
  "linkTypes": [
    {
      "name": "Qaira Tests",
      "outward": "tests",
      "inward": "is tested by"
    },
    {
      "name": "Qaira Validates",
      "outward": "validates",
      "inward": "is validated by"
    },
    {
      "name": "Qaira Contains",
      "outward": "contains",
      "inward": "is contained in"
    },
    {
      "name": "Qaira Planned In",
      "outward": "planned in",
      "inward": "includes planned test"
    },
    {
      "name": "Qaira Executes",
      "outward": "executes",
      "inward": "is executed by"
    },
    {
      "name": "Qaira Automates",
      "outward": "automates",
      "inward": "is automated by"
    },
    {
      "name": "Qaira Uses Object",
      "outward": "uses object",
      "inward": "is used by automation/test"
    },
    {
      "name": "Qaira Uses Data",
      "outward": "uses data",
      "inward": "is used by test"
    },
    {
      "name": "Qaira Found In Run",
      "outward": "found in run",
      "inward": "produced defect"
    },
    {
      "name": "Qaira Blocks QA",
      "outward": "blocks QA",
      "inward": "blocked by QA"
    },
    {
      "name": "Qaira Impacts QA",
      "outward": "impacts QA",
      "inward": "impacted by"
    },
    {
      "name": "Qaira Gates Release",
      "outward": "gates release",
      "inward": "is gated by"
    }
  ],
  "fieldTypeAliases": {
    "shortText": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:textfield",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:textsearcher"
    },
    "paragraph": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:textarea",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:textsearcher"
    },
    "select": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:select",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:multiselectsearcher"
    },
    "multiSelect": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:multiselect",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:multiselectsearcher"
    },
    "number": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:float",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:numberrange"
    },
    "date": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:datepicker",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:daterange"
    },
    "dateTime": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:datetime",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:datetimerange"
    },
    "user": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:userpicker",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:userpickergroupsearcher"
    },
    "labels": {
      "type": "com.atlassian.jira.plugin.system.customfieldtypes:labels",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:labelsearcher"
    }
  },
  "fields": [
    {
      "key": "entityId",
      "name": "Qaira Entity ID",
      "alias": "shortText",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "testPlan",
        "testRun",
        "automationAsset",
        "objectRepositoryItem",
        "testDataSet",
        "qualityGate"
      ],
      "description": "Stable Qaira UUID or generated entity ID."
    },
    {
      "key": "artifactVersion",
      "name": "Qaira Artifact Version",
      "alias": "number",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "testPlan",
        "testRun",
        "automationAsset",
        "objectRepositoryItem",
        "testDataSet",
        "qualityGate"
      ],
      "description": "Incremented version for governed QA artifacts."
    },
    {
      "key": "owner",
      "name": "Qaira Owner",
      "alias": "user",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "testPlan",
        "testRun",
        "automationAsset",
        "objectRepositoryItem",
        "testDataSet",
        "qualityGate"
      ],
      "description": "Business/QA owner."
    },
    {
      "key": "businessCriticality",
      "name": "Qaira Business Criticality",
      "alias": "select",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "testPlan",
        "qualityGate"
      ],
      "options": [
        "Low",
        "Medium",
        "High",
        "Critical"
      ],
      "description": "Business criticality for risk-based testing."
    },
    {
      "key": "riskScore",
      "name": "Qaira Risk Score",
      "alias": "number",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "testPlan",
        "qualityGate"
      ],
      "description": "0-100 risk score used by release readiness dashboards."
    },
    {
      "key": "aiSummary",
      "name": "Qaira AI Summary",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "testPlan",
        "testRun",
        "automationAsset",
        "objectRepositoryItem",
        "testDataSet",
        "qualityGate"
      ],
      "description": "Human-approved AI summary or recommendation."
    },
    {
      "key": "lastAiReviewDate",
      "name": "Qaira Last AI Review Date",
      "alias": "dateTime",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "testPlan",
        "testRun",
        "automationAsset",
        "objectRepositoryItem",
        "qualityGate"
      ],
      "description": "Last AI review timestamp."
    },
    {
      "key": "testType",
      "name": "Qaira Test Type",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Manual",
        "Automated",
        "BDD",
        "API",
        "Performance",
        "Security",
        "Accessibility",
        "Exploratory"
      ],
      "description": "Primary test design type."
    },
    {
      "key": "testLevel",
      "name": "Qaira Test Level",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Unit",
        "Component",
        "Integration",
        "System",
        "E2E",
        "UAT"
      ],
      "description": "Testing level."
    },
    {
      "key": "testStatus",
      "name": "Qaira Test Status",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Draft",
        "Ready for Review",
        "Approved",
        "Needs Update",
        "Deprecated"
      ],
      "description": "Logical test case lifecycle status."
    },
    {
      "key": "requirementCoverageState",
      "name": "Qaira Requirement Coverage State",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Linked",
        "Unlinked",
        "Not Applicable"
      ],
      "description": "Whether the test is linked to a Jira requirement."
    },
    {
      "key": "stepsCount",
      "name": "Qaira Steps Count",
      "alias": "number",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Step count rollup from issue property/attachment."
    },
    {
      "key": "expectedResultSummary",
      "name": "Qaira Expected Result Summary",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Short searchable expected result summary."
    },
    {
      "key": "preconditionsSummary",
      "name": "Qaira Preconditions Summary",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Short searchable preconditions summary."
    },
    {
      "key": "testDataRef",
      "name": "Qaira Test Data Ref",
      "alias": "shortText",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Reference to Qaira Test Data Set or external safe data reference."
    },
    {
      "key": "gherkinPresent",
      "name": "Qaira Gherkin Present",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Whether Gherkin content exists in property/attachment."
    },
    {
      "key": "automationStatus",
      "name": "Qaira Automation Status",
      "alias": "select",
      "issueTypeKeys": [
        "testCase",
        "automationAsset"
      ],
      "options": [
        "Not Automated",
        "Candidate",
        "Proposed",
        "Mapped",
        "In Progress",
        "Implemented",
        "Automated",
        "Broken",
        "Flaky",
        "Deprecated"
      ],
      "description": "Automation lifecycle state."
    },
    {
      "key": "automationKey",
      "name": "Qaira Automation Key",
      "alias": "shortText",
      "issueTypeKeys": [
        "testCase",
        "automationAsset",
        "testRun"
      ],
      "description": "Stable mapping key used by automation and CI result imports."
    },
    {
      "key": "automationFramework",
      "name": "Qaira Automation Framework",
      "alias": "select",
      "issueTypeKeys": [
        "testCase",
        "automationAsset"
      ],
      "options": [
        "Playwright",
        "Cypress",
        "Selenium",
        "Appium",
        "REST Assured",
        "Postman",
        "Karate",
        "Pytest",
        "JUnit",
        "TestNG",
        "NUnit",
        "Robot Framework",
        "Other"
      ],
      "description": "Automation framework."
    },
    {
      "key": "lastRunStatus",
      "name": "Qaira Last Run Status",
      "alias": "select",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "automationAsset"
      ],
      "options": [
        "Passed",
        "Failed",
        "Blocked",
        "Skipped",
        "Not Run",
        "Flaky",
        "Unknown"
      ],
      "description": "Latest execution status rollup."
    },
    {
      "key": "lastRunDate",
      "name": "Qaira Last Run Date",
      "alias": "dateTime",
      "issueTypeKeys": [
        "testCase",
        "testSuite"
      ],
      "description": "Latest execution date."
    },
    {
      "key": "lastPassedDate",
      "name": "Qaira Last Passed Date",
      "alias": "dateTime",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Latest successful run date."
    },
    {
      "key": "lastFailedDate",
      "name": "Qaira Last Failed Date",
      "alias": "dateTime",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Latest failed run date."
    },
    {
      "key": "lastRunEnvironment",
      "name": "Qaira Last Run Environment",
      "alias": "shortText",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Latest run environment."
    },
    {
      "key": "flakyScore",
      "name": "Qaira Flaky Score",
      "alias": "number",
      "issueTypeKeys": [
        "testCase",
        "automationAsset"
      ],
      "description": "0-100 flaky score."
    },
    {
      "key": "coverageScore",
      "name": "Qaira Coverage Score",
      "alias": "number",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "AI/human coverage quality score."
    },
    {
      "key": "duplicateScore",
      "name": "Qaira Duplicate Score",
      "alias": "number",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "AI duplicate likelihood score."
    },
    {
      "key": "staleReason",
      "name": "Qaira Stale Reason",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testCase"
      ],
      "description": "Reason the test needs update."
    },
    {
      "key": "aiReviewState",
      "name": "Qaira AI Review State",
      "alias": "select",
      "issueTypeKeys": [
        "testCase",
        "testPlan",
        "testRun",
        "qualityGate"
      ],
      "options": [
        "Not Reviewed",
        "Suggested",
        "Accepted",
        "Rejected",
        "Needs Human Review"
      ],
      "description": "Human approval state for AI suggestion."
    },
    {
      "key": "estimatedDuration",
      "name": "Qaira Estimated Duration",
      "alias": "number",
      "issueTypeKeys": [
        "testCase",
        "testSuite"
      ],
      "description": "Estimated execution minutes."
    },
    {
      "key": "caseTags",
      "name": "Qaira Tags",
      "alias": "labels",
      "issueTypeKeys": [
        "testCase",
        "testSuite",
        "automationAsset"
      ],
      "description": "Qaira searchable labels."
    },
    {
      "key": "negativeCase",
      "name": "Qaira Negative Case",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Negative scenario flag."
    },
    {
      "key": "boundaryCase",
      "name": "Qaira Boundary Case",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Boundary scenario flag."
    },
    {
      "key": "securityCase",
      "name": "Qaira Security Case",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Security scenario flag."
    },
    {
      "key": "accessibilityCase",
      "name": "Qaira Accessibility Case",
      "alias": "select",
      "issueTypeKeys": [
        "testCase"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Accessibility scenario flag."
    },
    {
      "key": "complianceRef",
      "name": "Qaira Compliance Ref",
      "alias": "shortText",
      "issueTypeKeys": [
        "testCase",
        "qualityGate"
      ],
      "description": "Compliance reference such as SOX, HIPAA, PCI, ISO."
    },
    {
      "key": "reuseCount",
      "name": "Qaira Reuse Count",
      "alias": "number",
      "issueTypeKeys": [
        "testCase",
        "objectRepositoryItem",
        "testDataSet"
      ],
      "description": "Usage/reuse count."
    },
    {
      "key": "maintenanceDebt",
      "name": "Qaira Maintenance Debt",
      "alias": "number",
      "issueTypeKeys": [
        "testCase",
        "automationAsset"
      ],
      "description": "0-100 maintenance debt score."
    },
    {
      "key": "suiteType",
      "name": "Qaira Suite Type",
      "alias": "select",
      "issueTypeKeys": [
        "testSuite"
      ],
      "options": [
        "Smoke",
        "Regression",
        "Feature",
        "Component",
        "API",
        "Security",
        "Accessibility",
        "Performance",
        "UAT",
        "Release",
        "Exploratory",
        "Custom"
      ],
      "description": "Suite purpose."
    },
    {
      "key": "suiteMode",
      "name": "Qaira Suite Mode",
      "alias": "select",
      "issueTypeKeys": [
        "testSuite"
      ],
      "options": [
        "Static",
        "Dynamic JQL",
        "Smart AI"
      ],
      "description": "Suite selection mode."
    },
    {
      "key": "suiteStatus",
      "name": "Qaira Suite Status",
      "alias": "select",
      "issueTypeKeys": [
        "testSuite"
      ],
      "options": [
        "Draft",
        "Active",
        "Deprecated"
      ],
      "description": "Suite status."
    },
    {
      "key": "dynamicJql",
      "name": "Qaira Dynamic JQL",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testSuite",
        "testPlan"
      ],
      "description": "Dynamic selection JQL for suites/plans."
    },
    {
      "key": "includedCaseCount",
      "name": "Qaira Included Case Count",
      "alias": "number",
      "issueTypeKeys": [
        "testSuite"
      ],
      "description": "Total included cases."
    },
    {
      "key": "manualCaseCount",
      "name": "Qaira Manual Case Count",
      "alias": "number",
      "issueTypeKeys": [
        "testSuite"
      ],
      "description": "Manual case count."
    },
    {
      "key": "automatedCaseCount",
      "name": "Qaira Automated Case Count",
      "alias": "number",
      "issueTypeKeys": [
        "testSuite"
      ],
      "description": "Automated case count."
    },
    {
      "key": "suiteCoveragePct",
      "name": "Qaira Suite Coverage %",
      "alias": "number",
      "issueTypeKeys": [
        "testSuite"
      ],
      "description": "Suite requirement coverage percentage."
    },
    {
      "key": "suiteHealth",
      "name": "Qaira Suite Health",
      "alias": "select",
      "issueTypeKeys": [
        "testSuite"
      ],
      "options": [
        "Healthy",
        "Risky",
        "Stale",
        "Broken"
      ],
      "description": "Suite health rollup."
    },
    {
      "key": "flakyTestsCount",
      "name": "Qaira Flaky Tests Count",
      "alias": "number",
      "issueTypeKeys": [
        "testSuite",
        "testPlan",
        "qualityGate"
      ],
      "description": "Count of flaky tests."
    },
    {
      "key": "staleTestsCount",
      "name": "Qaira Stale Tests Count",
      "alias": "number",
      "issueTypeKeys": [
        "testSuite",
        "testPlan",
        "qualityGate"
      ],
      "description": "Count of stale tests."
    },
    {
      "key": "recommendedFor",
      "name": "Qaira Recommended For",
      "alias": "multiSelect",
      "issueTypeKeys": [
        "testSuite"
      ],
      "options": [
        "Smoke",
        "Regression",
        "Release Gate",
        "PR Validation",
        "UAT",
        "Security",
        "Accessibility",
        "Performance"
      ],
      "description": "Recommended usage contexts."
    },
    {
      "key": "planType",
      "name": "Qaira Plan Type",
      "alias": "select",
      "issueTypeKeys": [
        "testPlan"
      ],
      "options": [
        "Release",
        "Sprint",
        "Hotfix",
        "Regression",
        "UAT",
        "Compliance",
        "Milestone"
      ],
      "description": "Plan type."
    },
    {
      "key": "scopeMode",
      "name": "Qaira Scope Mode",
      "alias": "select",
      "issueTypeKeys": [
        "testPlan"
      ],
      "options": [
        "Release",
        "Sprint",
        "JQL",
        "Manual",
        "AI Smart Scope"
      ],
      "description": "How the plan scope is built."
    },
    {
      "key": "executionOwner",
      "name": "Qaira Execution Owner",
      "alias": "user",
      "issueTypeKeys": [
        "testPlan",
        "testRun"
      ],
      "description": "Execution lead."
    },
    {
      "key": "plannedStart",
      "name": "Qaira Planned Start",
      "alias": "date",
      "issueTypeKeys": [
        "testPlan"
      ],
      "description": "Planned start date."
    },
    {
      "key": "plannedEnd",
      "name": "Qaira Planned End",
      "alias": "date",
      "issueTypeKeys": [
        "testPlan"
      ],
      "description": "Planned end date."
    },
    {
      "key": "coverageTargetPct",
      "name": "Qaira Coverage Target %",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan"
      ],
      "description": "Target coverage percentage."
    },
    {
      "key": "readinessStatus",
      "name": "Qaira Readiness Status",
      "alias": "select",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "options": [
        "Draft",
        "At Risk",
        "Ready",
        "Blocked",
        "Done",
        "Approved",
        "Rejected",
        "Approved With Risk"
      ],
      "description": "Plan/readiness state."
    },
    {
      "key": "requirementCount",
      "name": "Qaira Requirement Count",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Requirement count in scope."
    },
    {
      "key": "coveredRequirementCount",
      "name": "Qaira Covered Requirement Count",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Covered requirement count."
    },
    {
      "key": "currentCoveragePct",
      "name": "Qaira Current Coverage %",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Current coverage percentage."
    },
    {
      "key": "criticalRequirementCoveragePct",
      "name": "Qaira Critical Requirement Coverage %",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Critical requirement coverage percentage."
    },
    {
      "key": "manualScopeCount",
      "name": "Qaira Manual Scope Count",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan"
      ],
      "description": "Manual scope count."
    },
    {
      "key": "automationScopeCount",
      "name": "Qaira Automation Scope Count",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan"
      ],
      "description": "Automation scope count."
    },
    {
      "key": "environmentMatrix",
      "name": "Qaira Environment Matrix",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testPlan"
      ],
      "description": "Human-readable environment/browser/device matrix summary."
    },
    {
      "key": "browserMatrix",
      "name": "Qaira Browser Matrix",
      "alias": "multiSelect",
      "issueTypeKeys": [
        "testPlan",
        "testRun"
      ],
      "options": [
        "Chrome",
        "Safari",
        "Firefox",
        "Edge",
        "Mobile Chrome",
        "Mobile Safari",
        "Other"
      ],
      "description": "Browsers in scope."
    },
    {
      "key": "deviceMatrix",
      "name": "Qaira Device Matrix",
      "alias": "multiSelect",
      "issueTypeKeys": [
        "testPlan",
        "testRun"
      ],
      "options": [
        "Desktop",
        "iOS",
        "Android",
        "Tablet",
        "API",
        "Other"
      ],
      "description": "Device types in scope."
    },
    {
      "key": "entryCriteriaState",
      "name": "Qaira Entry Criteria State",
      "alias": "select",
      "issueTypeKeys": [
        "testPlan"
      ],
      "options": [
        "Not Met",
        "Partially Met",
        "Met"
      ],
      "description": "Entry criteria state."
    },
    {
      "key": "exitCriteriaState",
      "name": "Qaira Exit Criteria State",
      "alias": "select",
      "issueTypeKeys": [
        "testPlan"
      ],
      "options": [
        "Not Met",
        "Partially Met",
        "Met"
      ],
      "description": "Exit criteria state."
    },
    {
      "key": "releaseConfidenceIndex",
      "name": "Qaira Release Confidence Index",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "0-100 release confidence index."
    },
    {
      "key": "openBlockerDefects",
      "name": "Qaira Open Blocker Defects",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Open blocker defects in scope."
    },
    {
      "key": "failedCriticalTests",
      "name": "Qaira Failed Critical Tests",
      "alias": "number",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Failed critical test count."
    },
    {
      "key": "approvalRequired",
      "name": "Qaira Approval Required",
      "alias": "select",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Whether formal approval is required."
    },
    {
      "key": "approvedBy",
      "name": "Qaira Approved By",
      "alias": "user",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Approver."
    },
    {
      "key": "approvedDate",
      "name": "Qaira Approved Date",
      "alias": "dateTime",
      "issueTypeKeys": [
        "testPlan",
        "qualityGate"
      ],
      "description": "Approval timestamp."
    },
    {
      "key": "runType",
      "name": "Qaira Run Type",
      "alias": "select",
      "issueTypeKeys": [
        "testRun"
      ],
      "options": [
        "Manual",
        "Automation",
        "Hybrid",
        "Exploratory"
      ],
      "description": "Run execution type."
    },
    {
      "key": "runSource",
      "name": "Qaira Run Source",
      "alias": "select",
      "issueTypeKeys": [
        "testRun"
      ],
      "options": [
        "Jira UI",
        "CI",
        "API",
        "Imported",
        "Scheduled"
      ],
      "description": "Run source."
    },
    {
      "key": "runStatus",
      "name": "Qaira Run Status",
      "alias": "select",
      "issueTypeKeys": [
        "testRun"
      ],
      "options": [
        "Not Started",
        "In Progress",
        "Completed",
        "Failed",
        "Blocked",
        "Analyzed",
        "Closed"
      ],
      "description": "Run lifecycle status."
    },
    {
      "key": "testPlanKey",
      "name": "Qaira Test Plan Key",
      "alias": "shortText",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Linked plan key rollup."
    },
    {
      "key": "environment",
      "name": "Qaira Environment",
      "alias": "select",
      "issueTypeKeys": [
        "testRun",
        "testDataSet"
      ],
      "options": [
        "QA",
        "Staging",
        "UAT",
        "Prod-like",
        "Production",
        "Dev",
        "Other"
      ],
      "description": "Environment."
    },
    {
      "key": "startedAt",
      "name": "Qaira Started At",
      "alias": "dateTime",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Run start time."
    },
    {
      "key": "completedAt",
      "name": "Qaira Completed At",
      "alias": "dateTime",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Run completion time."
    },
    {
      "key": "durationMinutes",
      "name": "Qaira Duration Minutes",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Duration in minutes."
    },
    {
      "key": "buildNumber",
      "name": "Qaira Build Number",
      "alias": "shortText",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Build number."
    },
    {
      "key": "buildUrl",
      "name": "Qaira Build URL",
      "alias": "shortText",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Build/CI URL."
    },
    {
      "key": "commitSha",
      "name": "Qaira Commit SHA",
      "alias": "shortText",
      "issueTypeKeys": [
        "testRun",
        "automationAsset"
      ],
      "description": "Commit SHA."
    },
    {
      "key": "branch",
      "name": "Qaira Branch",
      "alias": "shortText",
      "issueTypeKeys": [
        "testRun",
        "automationAsset"
      ],
      "description": "Git branch."
    },
    {
      "key": "totalCount",
      "name": "Qaira Total Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Total execution rows represented by this run."
    },
    {
      "key": "passedCount",
      "name": "Qaira Passed Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Passed count."
    },
    {
      "key": "failedCount",
      "name": "Qaira Failed Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Failed count."
    },
    {
      "key": "blockedCount",
      "name": "Qaira Blocked Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Blocked count."
    },
    {
      "key": "skippedCount",
      "name": "Qaira Skipped Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Skipped count."
    },
    {
      "key": "notRunCount",
      "name": "Qaira Not Run Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Not-run count."
    },
    {
      "key": "failedCriticalCount",
      "name": "Qaira Failed Critical Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Failed critical count."
    },
    {
      "key": "defectsCreatedCount",
      "name": "Qaira Defects Created Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Defects created from run."
    },
    {
      "key": "linkedDefectsCount",
      "name": "Qaira Linked Defects Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Linked defects count."
    },
    {
      "key": "flakyCandidateCount",
      "name": "Qaira Flaky Candidate Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Flaky candidate count."
    },
    {
      "key": "rerunRecommendedCount",
      "name": "Qaira Rerun Recommended Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "AI-recommended rerun count."
    },
    {
      "key": "aiFailureSummary",
      "name": "Qaira AI Failure Summary",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Failure analysis summary."
    },
    {
      "key": "aiReleaseImpact",
      "name": "Qaira AI Release Impact",
      "alias": "select",
      "issueTypeKeys": [
        "testRun"
      ],
      "options": [
        "None",
        "Low",
        "Medium",
        "High",
        "Critical"
      ],
      "description": "Release impact estimate."
    },
    {
      "key": "resultAttachmentName",
      "name": "Qaira Result Attachment Name",
      "alias": "shortText",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Raw result attachment pointer."
    },
    {
      "key": "evidenceAttachmentCount",
      "name": "Qaira Evidence Attachment Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Evidence attachment count."
    },
    {
      "key": "importFormat",
      "name": "Qaira Import Format",
      "alias": "select",
      "issueTypeKeys": [
        "testRun"
      ],
      "options": [
        "JUnit",
        "Cucumber",
        "Playwright",
        "Cypress",
        "Allure",
        "Pytest",
        "Postman",
        "Karate",
        "REST Assured",
        "TestNG",
        "NUnit",
        "Robot Framework",
        "Manual"
      ],
      "description": "Result import format."
    },
    {
      "key": "importStatus",
      "name": "Qaira Import Status",
      "alias": "select",
      "issueTypeKeys": [
        "testRun"
      ],
      "options": [
        "Pending",
        "Parsed",
        "Failed",
        "Partially Mapped",
        "Mapped"
      ],
      "description": "Import mapping status."
    },
    {
      "key": "unmappedResultCount",
      "name": "Qaira Unmapped Result Count",
      "alias": "number",
      "issueTypeKeys": [
        "testRun"
      ],
      "description": "Unmapped automation result count."
    },
    {
      "key": "repositoryUrl",
      "name": "Qaira Repository URL",
      "alias": "shortText",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "Repository URL or safe reference."
    },
    {
      "key": "filePath",
      "name": "Qaira File Path",
      "alias": "shortText",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "Automation file path."
    },
    {
      "key": "functionName",
      "name": "Qaira Function Name",
      "alias": "shortText",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "Automation test function/class."
    },
    {
      "key": "lastSyncedCommit",
      "name": "Qaira Last Synced Commit",
      "alias": "shortText",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "Last synchronized commit."
    },
    {
      "key": "lastExecutionStatus",
      "name": "Qaira Last Execution Status",
      "alias": "select",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "options": [
        "Passed",
        "Failed",
        "Blocked",
        "Skipped",
        "Not Run",
        "Flaky",
        "Unknown"
      ],
      "description": "Last automation execution status."
    },
    {
      "key": "lastExecutionDate",
      "name": "Qaira Last Execution Date",
      "alias": "dateTime",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "Last automation execution date."
    },
    {
      "key": "maintainabilityScore",
      "name": "Qaira Maintainability Score",
      "alias": "number",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "0-100 maintainability score."
    },
    {
      "key": "locatorStabilityScore",
      "name": "Qaira Locator Stability Score",
      "alias": "number",
      "issueTypeKeys": [
        "automationAsset",
        "objectRepositoryItem",
        "qualityGate"
      ],
      "description": "0-100 locator stability score."
    },
    {
      "key": "automationDebt",
      "name": "Qaira Automation Debt",
      "alias": "number",
      "issueTypeKeys": [
        "automationAsset",
        "qualityGate"
      ],
      "description": "Automation debt index."
    },
    {
      "key": "objectRepositoryCoveragePct",
      "name": "Qaira Object Repository Coverage %",
      "alias": "number",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "% of automation mapped to object repository items."
    },
    {
      "key": "generatedCodeAttachment",
      "name": "Qaira Generated Code Attachment",
      "alias": "shortText",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "Attachment pointer for generated automation draft."
    },
    {
      "key": "ciJobUrl",
      "name": "Qaira CI Job URL",
      "alias": "shortText",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "CI job URL."
    },
    {
      "key": "lastFailureCluster",
      "name": "Qaira Last Failure Cluster",
      "alias": "shortText",
      "issueTypeKeys": [
        "automationAsset"
      ],
      "description": "Latest failure cluster name."
    },
    {
      "key": "objectType",
      "name": "Qaira Object Type",
      "alias": "select",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "options": [
        "Web Element",
        "Mobile Element",
        "Page",
        "Component",
        "API Endpoint",
        "GraphQL Operation",
        "Database Object",
        "Message/Event Contract",
        "Reusable Assertion",
        "Reusable Action"
      ],
      "description": "Object repository item type."
    },
    {
      "key": "applicationArea",
      "name": "Qaira Application Area",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Functional area such as checkout or login."
    },
    {
      "key": "objectKey",
      "name": "Qaira Object Key",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Stable object key."
    },
    {
      "key": "primaryLocatorStrategy",
      "name": "Qaira Primary Locator Strategy",
      "alias": "select",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "options": [
        "role",
        "testId",
        "css",
        "xpath",
        "text",
        "label",
        "id",
        "name",
        "accessibilityId",
        "apiPath",
        "graphqlOperation"
      ],
      "description": "Primary locator strategy."
    },
    {
      "key": "primaryLocatorValue",
      "name": "Qaira Primary Locator Value",
      "alias": "paragraph",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Primary locator value."
    },
    {
      "key": "locatorStatus",
      "name": "Qaira Locator Status",
      "alias": "select",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "options": [
        "Active",
        "Candidate",
        "Unstable",
        "Deprecated"
      ],
      "description": "Locator lifecycle status."
    },
    {
      "key": "pageName",
      "name": "Qaira Page Name",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Page object grouping."
    },
    {
      "key": "componentName",
      "name": "Qaira Component Name",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "UI/API component name."
    },
    {
      "key": "secondaryLocatorStrategy",
      "name": "Qaira Secondary Locator Strategy",
      "alias": "select",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "options": [
        "role",
        "testId",
        "css",
        "xpath",
        "text",
        "label",
        "id",
        "name",
        "accessibilityId",
        "apiPath",
        "graphqlOperation"
      ],
      "description": "Fallback locator strategy."
    },
    {
      "key": "secondaryLocatorValue",
      "name": "Qaira Secondary Locator Value",
      "alias": "paragraph",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Fallback locator value."
    },
    {
      "key": "accessibilityRole",
      "name": "Qaira Accessibility Role",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Accessibility role."
    },
    {
      "key": "accessibleName",
      "name": "Qaira Accessible Name",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Accessible name."
    },
    {
      "key": "testId",
      "name": "Qaira Test ID",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "data-testid or similar."
    },
    {
      "key": "cssSelector",
      "name": "Qaira CSS Selector",
      "alias": "paragraph",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "CSS selector."
    },
    {
      "key": "xpath",
      "name": "Qaira XPath",
      "alias": "paragraph",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "XPath selector; treated as brittle by Locator AI unless justified."
    },
    {
      "key": "apiMethod",
      "name": "Qaira API Method",
      "alias": "select",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "options": [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE"
      ],
      "description": "API method for API object."
    },
    {
      "key": "apiPath",
      "name": "Qaira API Path",
      "alias": "paragraph",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "API path."
    },
    {
      "key": "lastValidationStatus",
      "name": "Qaira Last Validation Status",
      "alias": "select",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "options": [
        "Found",
        "Missing",
        "Changed",
        "Ambiguous",
        "Not Validated"
      ],
      "description": "Latest object validation status."
    },
    {
      "key": "aiHealingSuggestion",
      "name": "Qaira AI Healing Suggestion",
      "alias": "paragraph",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "AI locator/object healing suggestion."
    },
    {
      "key": "screenshotAttachment",
      "name": "Qaira Screenshot Attachment",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "Screenshot evidence pointer."
    },
    {
      "key": "domSnapshotAttachment",
      "name": "Qaira DOM Snapshot Attachment",
      "alias": "shortText",
      "issueTypeKeys": [
        "objectRepositoryItem"
      ],
      "description": "DOM/snapshot attachment pointer."
    },
    {
      "key": "dataSetType",
      "name": "Qaira Data Set Type",
      "alias": "select",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "options": [
        "User",
        "Account",
        "Product",
        "Payment",
        "API Payload",
        "File",
        "Synthetic"
      ],
      "description": "Test data type."
    },
    {
      "key": "dataSensitivity",
      "name": "Qaira Data Sensitivity",
      "alias": "select",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "options": [
        "Public",
        "Internal",
        "Sensitive",
        "Restricted",
        "Masked"
      ],
      "description": "Data sensitivity classification."
    },
    {
      "key": "dataStatus",
      "name": "Qaira Data Status",
      "alias": "select",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "options": [
        "Draft",
        "Active",
        "Deprecated"
      ],
      "description": "Test data status."
    },
    {
      "key": "dataRef",
      "name": "Qaira Data Ref",
      "alias": "shortText",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "description": "Safe data pointer, not a secret."
    },
    {
      "key": "dataShape",
      "name": "Qaira Data Shape",
      "alias": "paragraph",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "description": "Data shape/schema summary."
    },
    {
      "key": "maskingRequired",
      "name": "Qaira Masking Required",
      "alias": "select",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Whether masking is required."
    },
    {
      "key": "syntheticData",
      "name": "Qaira Synthetic Data",
      "alias": "select",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "options": [
        "Yes",
        "No"
      ],
      "description": "Whether data is synthetic."
    },
    {
      "key": "failureCorrelationScore",
      "name": "Qaira Failure Correlation Score",
      "alias": "number",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "description": "Correlation of data set to failures."
    },
    {
      "key": "attachmentPointer",
      "name": "Qaira Attachment Pointer",
      "alias": "shortText",
      "issueTypeKeys": [
        "testDataSet"
      ],
      "description": "Attachment pointer for safe sample data."
    },
    {
      "key": "gateType",
      "name": "Qaira Gate Type",
      "alias": "select",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "options": [
        "Release",
        "Hotfix",
        "Compliance",
        "UAT",
        "Production Readiness"
      ],
      "description": "Gate type."
    },
    {
      "key": "gateStatus",
      "name": "Qaira Gate Status",
      "alias": "select",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "options": [
        "Draft",
        "Reviewing",
        "Approved",
        "Approved With Risk",
        "Rejected",
        "Deferred"
      ],
      "description": "Gate status."
    },
    {
      "key": "testExecutionPassRatePct",
      "name": "Qaira Test Execution Pass Rate %",
      "alias": "number",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "description": "Pass rate percentage."
    },
    {
      "key": "criticalPassRatePct",
      "name": "Qaira Critical Pass Rate %",
      "alias": "number",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "description": "Critical pass rate percentage."
    },
    {
      "key": "openCriticalBugs",
      "name": "Qaira Open Critical Bugs",
      "alias": "number",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "description": "Open critical bugs."
    },
    {
      "key": "automationHealthPct",
      "name": "Qaira Automation Health %",
      "alias": "number",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "description": "Automation health percentage."
    },
    {
      "key": "defectLeakageRisk",
      "name": "Qaira Defect Leakage Risk",
      "alias": "select",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "options": [
        "Low",
        "Medium",
        "High",
        "Critical"
      ],
      "description": "Defect leakage risk."
    },
    {
      "key": "aiGoNoGoSummary",
      "name": "Qaira AI Go/No-Go Summary",
      "alias": "paragraph",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "description": "Executive go/no-go summary."
    },
    {
      "key": "businessRiskAcceptedBy",
      "name": "Qaira Business Risk Accepted By",
      "alias": "user",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "description": "Business risk approver."
    },
    {
      "key": "riskAcceptanceNotes",
      "name": "Qaira Risk Acceptance Notes",
      "alias": "paragraph",
      "issueTypeKeys": [
        "qualityGate"
      ],
      "description": "Risk acceptance notes."
    },
    {
      "key": "reqCoveragePct",
      "name": "Qaira Coverage %",
      "alias": "number",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Requirement-level coverage percentage rollup."
    },
    {
      "key": "reqTestCount",
      "name": "Qaira Test Count",
      "alias": "number",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Linked test count rollup."
    },
    {
      "key": "reqCriticalTestCount",
      "name": "Qaira Critical Test Count",
      "alias": "number",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Critical linked tests count."
    },
    {
      "key": "reqAutomatedTestCount",
      "name": "Qaira Automated Test Count",
      "alias": "number",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Automated linked tests count."
    },
    {
      "key": "reqLastRunStatus",
      "name": "Qaira Requirement Last Run Status",
      "alias": "select",
      "issueTypeKeys": [
        "requirements"
      ],
      "options": [
        "Passed",
        "Failed",
        "Blocked",
        "Skipped",
        "Not Run",
        "Flaky",
        "Unknown"
      ],
      "description": "Latest linked-test status for requirement."
    },
    {
      "key": "reqLastTestedDate",
      "name": "Qaira Last Tested Date",
      "alias": "dateTime",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Last tested date rollup."
    },
    {
      "key": "reqOpenQaDefects",
      "name": "Qaira Open QA Defects",
      "alias": "number",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Open QA defect count."
    },
    {
      "key": "reqStaleTestCount",
      "name": "Qaira Requirement Stale Test Count",
      "alias": "number",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Stale linked-test count."
    },
    {
      "key": "reqRiskScore",
      "name": "Qaira Requirement Risk Score",
      "alias": "number",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "Requirement risk score."
    },
    {
      "key": "reqAiCoverageSummary",
      "name": "Qaira AI Coverage Summary",
      "alias": "paragraph",
      "issueTypeKeys": [
        "requirements"
      ],
      "description": "AI coverage summary on requirement issues."
    }
  ],
  "issueProperties": {
    "testCase": "qaira.testCaseSpec.v1",
    "testCaseVersion": "qaira.testCaseVersion.v1",
    "suite": "qaira.suiteDefinition.v1",
    "plan": "qaira.planScope.v1",
    "run": "qaira.runExecution.v1",
    "automationAsset": "qaira.automationAsset.v1",
    "objectRepositoryItem": "qaira.objectRepositoryItem.v1",
    "testDataSet": "qaira.testDataSet.v1",
    "qualityGate": "qaira.qualityGate.v1",
    "projectRegistry": "qaira.registry.v1"
  },
  "reports": [
    {
      "key": "releaseConfidence",
      "name": "Release Confidence Index",
      "formula": "100 - 0.25*UncoveredCriticalRequirementPct - 0.20*FailedCriticalTestPct - 0.15*OpenBlockerCriticalDefectScore - 0.10*StaleCriticalTestPct - 0.10*FlakyCriticalTestPct - 0.10*AutomationGapPct - 0.05*LocatorInstabilityPct - 0.05*ExecutionSlippagePct"
    },
    {
      "key": "requirementCoverage",
      "name": "Requirement Coverage %",
      "formula": "Covered requirements / testable requirements * 100"
    },
    {
      "key": "effectiveAutomationCoverage",
      "name": "Effective Automation Coverage %",
      "formula": "Automated tests that passed at least once in last N days / approved test cases * 100"
    },
    {
      "key": "flakyRate",
      "name": "Flaky Test Rate",
      "formula": "Tests with inconsistent pass/fail over last N runs / tests executed over last N runs * 100"
    },
    {
      "key": "locatorInstability",
      "name": "Locator Instability %",
      "formula": "Unstable object repository items / active object repository items * 100"
    },
    {
      "key": "qaDebt",
      "name": "QA Debt Index",
      "formula": "Weighted stale tests + duplicate tests + flaky tests + unautomated critical tests + unstable locators + uncovered requirements + unreviewed AI suggestions"
    }
  ],
  "agents": [
    "Requirement Quality Agent",
    "Test Design Agent",
    "Smart Planning Agent",
    "Coverage Agent",
    "Automation Agent",
    "Object Repository Agent",
    "Run Triage Agent",
    "Release Risk Agent",
    "Defect Intelligence Agent"
  ]
};
