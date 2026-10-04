import { useEffect, useState } from 'react';

import { useTasksStore } from '../../stores/tasksStore';

import { DispatchModal } from './DispatchModal';
import { JsonEditorView } from './JsonEditorView';
import { StepAdder } from './StepAdder';
import { StepCard } from './StepCard';
import { TaskDrawer } from './TaskDrawer';
import { TaskStudioHeader } from './TaskStudioHeader';
import { WorkflowVariablesBar } from './WorkflowVariablesBar';

export function TaskStudioView() {
  const { currentWorkflow, activeTab, loadTasks } = useTasksStore();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    void loadTasks(true);
  }, [loadTasks]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-app)',
        color: 'var(--text-main)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top Header */}
      <TaskStudioHeader
        isDrawerOpen={isDrawerOpen}
        onToggleTasksDrawer={() => setIsDrawerOpen(!isDrawerOpen)}
      />

      {/* Variables Bar */}
      <WorkflowVariablesBar />

      {/* Main Viewport Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {activeTab === 'visual' ? (
          <div
            style={{
              maxWidth: '900px',
              margin: '0 auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {/* Visual Step Cards */}
            {currentWorkflow.steps.map((step, index) => (
              <StepCard
                key={`step-${index}-${step.type}`}
                index={index}
                step={step}
                totalSteps={currentWorkflow.steps.length}
              />
            ))}

            {/* Quick Step Adder */}
            <StepAdder />
          </div>
        ) : (
          <JsonEditorView />
        )}
      </div>

      {/* Saved Tasks Drawer */}
      <TaskDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      {/* Dispatch Modal */}
      <DispatchModal />
    </div>
  );
}

export default TaskStudioView;
