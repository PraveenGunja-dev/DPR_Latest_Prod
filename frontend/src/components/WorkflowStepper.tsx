import React from 'react';

interface WorkflowStepperProps {
  status: string;
}

/**
 * WorkflowStepper — Visual 1 → 2 → 3 progress indicator for DPR entry workflow.
 * 
 * Step 1: Supervisor Submitted
 * Step 2: Site PM Approved
 * Step 3: PMAG Approved / Pushed to P6
 * 
 * When Site PM edits (rejected_by_pm), step 1 shows with an amber "edited" indicator.
 */
export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({ status }) => {
  const normalized = (status || 'draft').toLowerCase().trim();

  // Determine which steps are completed, active, or edited
  const step1Complete = ['submitted_to_pm', 'approved_by_pm', 'final_approved'].includes(normalized);
  const step2Complete = ['approved_by_pm', 'final_approved'].includes(normalized);
  const step3Complete = normalized === 'final_approved';

  // "Edited" state — PM rejected or sent back for revision
  const isEdited = ['rejected_by_pm', 'rejected_by_pmag'].includes(normalized);

  // Step colors
  const getStepStyle = (stepNum: number) => {
    const isComplete = stepNum === 1 ? step1Complete : stepNum === 2 ? step2Complete : step3Complete;

    if (isEdited && stepNum === 1) {
      // Edited/rejected — amber color to indicate "needs attention"
      return {
        circle: 'bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-200',
        label: 'text-amber-700 font-semibold',
        pulse: true,
      };
    }

    if (isComplete) {
      return {
        circle: 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200',
        label: 'text-emerald-700 font-semibold',
        pulse: false,
      };
    }

    // Not reached yet
    return {
      circle: 'bg-slate-100 text-slate-400 border-slate-300',
      label: 'text-slate-400',
      pulse: false,
    };
  };

  const getConnectorColor = (fromStep: number) => {
    if (isEdited && fromStep === 1) return 'bg-amber-300';
    const fromComplete = fromStep === 1 ? step1Complete : step2Complete;
    const toComplete = fromStep === 1 ? step2Complete : step3Complete;
    if (fromComplete && toComplete) return 'bg-emerald-400';
    if (fromComplete) return 'bg-emerald-200';
    return 'bg-slate-200';
  };

  const steps = [
    { num: 1, label: 'Submitted' },
    { num: 2, label: 'PM Approved' },
    { num: 3, label: 'PMAG Approved' },
  ];

  // Tooltip text for context
  const getTooltip = () => {
    switch (normalized) {
      case 'draft': return 'Draft — Not yet submitted';
      case 'submitted_to_pm': return 'Submitted to Site PM for review';
      case 'approved_by_pm': return 'Approved by Site PM, pending PMAG';
      case 'final_approved': return 'Approved by PMAG & pushed to P6';
      case 'rejected_by_pm': return 'Rejected by Site PM — needs revision';
      case 'rejected_by_pmag': return 'Rejected by PMAG — needs revision';
      default: return status;
    }
  };

  return (
    <div className="flex items-center gap-0" title={getTooltip()}>
      {steps.map((step, idx) => {
        const style = getStepStyle(step.num);
        return (
          <React.Fragment key={step.num}>
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  relative w-6 h-6 rounded-full border-2 flex items-center justify-center 
                  text-[10px] font-bold transition-all duration-300
                  ${style.circle}
                  ${style.pulse ? 'animate-pulse' : ''}
                `}
              >
                {step.num}
                {/* Edited indicator icon for step 1 */}
                {isEdited && step.num === 1 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 border border-white rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" className="w-2 h-2 text-white" fill="currentColor">
                      <path d="M9.174 1.424a1.2 1.2 0 0 0-1.697 0L2.28 6.62a.4.4 0 0 0-.104.18l-.6 2.4a.4.4 0 0 0 .486.486l2.4-.6a.4.4 0 0 0 .18-.104l5.196-5.196a1.2 1.2 0 0 0 0-1.697l-.664-.665Z"/>
                    </svg>
                  </span>
                )}
              </div>
              <span className={`text-[8px] mt-0.5 whitespace-nowrap leading-tight ${style.label}`}>
                {isEdited && step.num === 1 ? 'Edited' : step.label}
              </span>
            </div>

            {/* Connector line between steps */}
            {idx < steps.length - 1 && (
              <div className={`w-5 h-[2px] mt-[-10px] rounded-full ${getConnectorColor(step.num)} transition-all duration-300`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
