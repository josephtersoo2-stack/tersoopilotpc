import { describe, expect, it } from 'vitest';

import { WorkflowValidator } from '../src/task/WorkflowValidator';
import { TaskError } from '../src/util/errors';

describe('Ticket 4.7: WorkflowValidator & Workflow Schema v1 Parser', () => {
  const validWorkflow = {
    schemaVersion: 1,
    name: 'Standard Login Workflow',
    variables: {
      baseUrl: 'https://example.com',
      username: 'johndoe@example.com',
    },
    steps: [
      {
        type: 'navigate',
        url: '{{baseUrl}}/login',
        waitUntil: 'domcontentloaded',
      },
      {
        type: 'waitFor',
        selector: '//input[@name="email"]',
        timeoutMs: 10000,
      },
      {
        type: 'type',
        selector: '//input[@name="email"]',
        text: '{{username}}',
        humanized: true,
      },
      {
        type: 'click',
        selector: '//button[@type="submit"]',
        humanized: true,
      },
      {
        type: 'extract',
        selector: '#session-token',
        as: 'authToken',
      },
      {
        type: 'type',
        selector: '#confirm-box',
        text: 'Token: {{authToken}}', // Defined in preceding extract step!
      },
      {
        type: 'scroll',
        direction: 'down',
        amount: 250,
      },
      {
        type: 'screenshot',
        name: 'dashboard',
      },
      {
        type: 'sleep',
        minMs: 500,
        maxMs: 1500,
      },
    ],
  };

  it('validates a complete valid workflow definition', () => {
    const res = WorkflowValidator.validate(validWorkflow);

    expect(res.ok).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.workflow?.name).toBe('Standard Login Workflow');
    expect(res.workflow?.steps).toHaveLength(9);
  });

  it('fails when a referenced variable is never defined or extracted', () => {
    const invalidWorkflow = {
      ...validWorkflow,
      steps: [
        {
          type: 'navigate',
          url: '{{unresolvedDomain}}/login',
        },
      ],
    };

    const res = WorkflowValidator.validate(invalidWorkflow);

    expect(res.ok).toBe(false);
    expect(res.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Referenced variable '{{unresolvedDomain}}' is not defined"),
      ]),
    );
  });

  it('fails when variable is referenced before it is extracted', () => {
    const workflowWithEarlyReference = {
      schemaVersion: 1,
      name: 'Early Reference Workflow',
      variables: {},
      steps: [
        {
          type: 'type',
          selector: '#input',
          text: '{{extractedCode}}', // Referenced before step 2 extracts it!
        },
        {
          type: 'extract',
          selector: '#code',
          as: 'extractedCode',
        },
      ],
    };

    const res = WorkflowValidator.validate(workflowWithEarlyReference);

    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("Referenced variable '{{extractedCode}}' is not defined");
  });

  it('fails semantic validation when sleep minMs > maxMs', () => {
    const invalidSleep = {
      ...validWorkflow,
      steps: [
        {
          type: 'sleep',
          minMs: 5000,
          maxMs: 1000, // Invalid!
        },
      ],
    };

    const res = WorkflowValidator.validate(invalidSleep);

    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain('minMs (5000) cannot be greater than maxMs (1000)');
  });

  it('fails semantic validation when extract variable name is not a valid identifier', () => {
    const invalidExtract = {
      ...validWorkflow,
      steps: [
        {
          type: 'extract',
          selector: '#elem',
          as: '123-invalid-name!',
        },
      ],
    };

    const res = WorkflowValidator.validate(invalidExtract);

    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("must be a valid alphanumeric identifier");
  });

  it('parses valid workflow JSON string and throws TaskError on invalid JSON', () => {
    const jsonString = JSON.stringify(validWorkflow);
    const parsed = WorkflowValidator.parse(jsonString);

    expect(parsed.name).toBe(validWorkflow.name);

    expect(() => WorkflowValidator.parse('{ invalid json')).toThrow(TaskError);
  });

  it('interpolates strings and Step objects with runtime variables', () => {
    const interpolatedText = WorkflowValidator.interpolate(
      'Welcome {{user}}, to {{site}}!',
      { user: 'Alice', site: 'TersooPilot' },
    );
    expect(interpolatedText).toBe('Welcome Alice, to TersooPilot!');

    const step = {
      type: 'navigate' as const,
      url: '{{domain}}/home',
      waitUntil: 'load' as const,
    };
    const interpolatedStep = WorkflowValidator.interpolateStep(step, {
      domain: 'https://test.com',
    });

    expect(interpolatedStep.type).toBe('navigate');
    if (interpolatedStep.type === 'navigate') {
      expect(interpolatedStep.url).toBe('https://test.com/home');
    }
  });

  it('validates and heals workflow with numeric and boolean variables', () => {
    const workflowWithNumericVars = {
      name: 'YouTube eFootball Watch Task',
      variables: {
        watchMs: 60000,
        query: 'eFootball',
        isMobile: true,
      },
      steps: [
        { type: 'navigate', url: 'https://youtube.com', waitUntil: 'domcontentloaded' },
        { type: 'sleep', minMs: 2000, maxMs: 4000 },
      ],
    };

    const res = WorkflowValidator.validate(workflowWithNumericVars);
    expect(res.ok).toBe(true);
    expect(res.workflow?.variables?.watchMs).toBe('60000');
    expect(res.workflow?.variables?.query).toBe('eFootball');
  });
});
