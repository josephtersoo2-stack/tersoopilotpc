export type AIAction =
  | {
      type: 'navigate';
      url: string;
    }
  | {
      type: 'open_tab';
      url: string;
    }
  | {
      type: 'click';
      target: {
        ref?: number | string;
        role?: string;
        name?: string;
        testId?: string;
      };
    }
  | {
      type: 'fill';
      target: {
        ref?: number | string;
        label?: string;
        name?: string;
        testId?: string;
      };
      value: string;
      pressEnter?: boolean;
    }
  | {
      type: 'wait_for_url';
      pattern: string;
    }
  | {
      type: 'wait_for_element';
      target: {
        role?: string;
        name?: string;
        testId?: string;
      };
    }
  | {
      type: 'back';
    }
  | {
      type: 'forward';
    }
  | {
      type: 'finish';
      reason: string;
    }
  | {
      type: 'request_human';
      reason: string;
    };
