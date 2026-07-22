import { styled } from '@linaria/react';
import { useCallback, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { ModalHeader } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptImportMapStep } from '@/local-db/research/import-wizard/components/ManuscriptImportMapStep';
import { ManuscriptImportReviewStep } from '@/local-db/research/import-wizard/components/ManuscriptImportReviewStep';
import { ManuscriptImportUploadStep } from '@/local-db/research/import-wizard/components/ManuscriptImportUploadStep';
import { MANUSCRIPT_IMPORT_WIZARD_MODAL_ID } from '@/local-db/research/import-wizard/constants/ManuscriptImportWizardModalId';
import { MANUSCRIPT_IMPORT_WIZARD_STEPS } from '@/local-db/research/import-wizard/constants/ManuscriptImportWizardSteps';
import { type ManuscriptImportWizardOptions } from '@/local-db/research/import-wizard/states/manuscriptImportWizardState';
import { type ImportedDocument } from '@/local-db/research/manuscript/manuscriptDocImport';
import { type ImportedDocumentSource } from '@/local-db/research/manuscript/manuscriptDocxFile';
import {
  prepareManuscriptImport,
  type PreparedManuscriptImport,
} from '@/local-db/research/manuscript/manuscriptImportPrepare';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { StepBar } from '@/ui/navigation/step-bar/components/StepBar';

type ManuscriptImportWizardProps = {
  options: ManuscriptImportWizardOptions;
  onClose: () => void;
};

type BlocksDocumentSource = Extract<ImportedDocumentSource, { kind: 'blocks' }>;

type ReviewPayload = {
  document: ImportedDocument;
  preparedImport: PreparedManuscriptImport;
  sourceName: string;
};

const STEP_LABELS = ['Upload', 'Map document', 'Review & commit'] as const;

const StyledModalContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: min(800px, calc(100vh - 64px));
  min-height: 600px;
  min-width: 800px;
`;

const StyledHeaderContent = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledStepContent = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const isFormElementFocused = (): boolean => {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  return (
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(activeElement.tagName) ||
    activeElement.isContentEditable
  );
};

export const ManuscriptImportWizard = ({
  options,
  onClose,
}: ManuscriptImportWizardProps) => {
  const { enqueueDialog } = useDialogManager();
  const [activeStep, setActiveStep] = useState(0);
  const [blocksSource, setBlocksSource] = useState<BlocksDocumentSource | null>(
    null,
  );
  const [reconcile, setReconcile] = useState(true);
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(
    null,
  );
  const [enterHandler, setEnterHandler] = useState<(() => void) | null>(null);

  const registerEnterHandler = useCallback((handler: (() => void) | null) => {
    setEnterHandler(() => handler);
  }, []);

  const handleEnter = () => {
    if (!isFormElementFocused()) enterHandler?.();
  };

  const confirmOnClose = () => {
    if (activeStep === 0) {
      onClose();
      return;
    }
    enqueueDialog({
      title: 'Exit manuscript import',
      message: 'Are you sure? Your mapping changes will not be saved.',
      buttons: [
        { title: 'Cancel' },
        {
          title: 'Exit',
          accent: 'danger',
          role: 'confirm',
          onClick: onClose,
        },
      ],
    });
  };

  const handleBlocksLoaded = useCallback(
    (source: BlocksDocumentSource, shouldReconcile: boolean) => {
      setBlocksSource(source);
      setReconcile(shouldReconcile);
      setActiveStep(1);
    },
    [],
  );

  const handlePortableLoaded = useCallback(
    (
      document: ImportedDocument,
      sourceName: string,
      shouldReconcile: boolean,
    ) => {
      setReconcile(shouldReconcile);
      setReviewPayload({
        document,
        preparedImport: prepareManuscriptImport(document, shouldReconcile),
        sourceName,
      });
      setActiveStep(2);
    },
    [],
  );

  const handleMapContinue = useCallback(
    (
      document: ImportedDocument,
      preparedImport: PreparedManuscriptImport,
      sourceName: string,
    ) => {
      setReviewPayload({ document, preparedImport, sourceName });
      setActiveStep(2);
    },
    [],
  );

  return (
    <ModalStatefulWrapper
      size="extraLarge"
      padding="none"
      modalInstanceId={MANUSCRIPT_IMPORT_WIZARD_MODAL_ID}
      isClosable
      onClose={confirmOnClose}
      onEnter={handleEnter}
      shouldCloseModalOnClickOutsideOrEscape={false}
    >
      <StyledModalContent>
        <ModalHeader
          hasBorderBottom
          paddingHorizontal={30}
          backgroundColor={themeCssVariables.background.secondary}
        >
          <StyledHeaderContent>
            <StepBar activeStep={activeStep}>
              {MANUSCRIPT_IMPORT_WIZARD_STEPS.map((step, index) => (
                <StepBar.Step
                  key={step}
                  activeStep={activeStep}
                  label={STEP_LABELS[index]}
                />
              ))}
            </StepBar>
            <Button
              title="Close"
              variant="tertiary"
              size="small"
              onClick={confirmOnClose}
            />
          </StyledHeaderContent>
        </ModalHeader>
        <StyledStepContent>
          {activeStep === 0 ? (
            <ManuscriptImportUploadStep
              onBlocksLoaded={handleBlocksLoaded}
              onPortableLoaded={handlePortableLoaded}
              registerEnterHandler={registerEnterHandler}
            />
          ) : activeStep === 1 && blocksSource !== null ? (
            <ManuscriptImportMapStep
              blocks={blocksSource.blocks}
              sourceInfo={blocksSource.sourceInfo}
              sourceName={blocksSource.sourceName}
              reconcile={reconcile}
              tableStyle={options.exportTableStyle ?? 'ACADEMIC'}
              onContinue={handleMapContinue}
              registerEnterHandler={registerEnterHandler}
            />
          ) : activeStep === 2 && reviewPayload !== null ? (
            <ManuscriptImportReviewStep
              document={reviewPayload.document}
              preparedImport={reviewPayload.preparedImport}
              sourceName={reviewPayload.sourceName}
            />
          ) : null}
        </StyledStepContent>
      </StyledModalContent>
    </ModalStatefulWrapper>
  );
};
