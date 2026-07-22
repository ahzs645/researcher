import { styled } from '@linaria/react';
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';

// Rendered into document.body via a portal: anchors (equation blocks, citation
// chips) live inside overflow-clipped editor nodes, so an absolutely
// positioned child popover would be invisible.
const StyledPopover = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-shadow: ${themeCssVariables.boxShadow.strong};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  max-height: 360px;
  min-width: 300px;
  overflow: auto;
  padding: ${themeCssVariables.spacing[3]};
  position: fixed;
  z-index: 1000;
`;

const POPOVER_MIN_WIDTH = 300;
const POPOVER_VIEWPORT_MARGIN = 8;

type ManuscriptEditorPopoverProps = {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  onClose: () => void;
};

export const ManuscriptEditorPopover = ({
  anchorRef,
  children,
  onClose,
}: ManuscriptEditorPopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useLayoutEffect(() => {
    const anchorRect = anchorRef.current?.getBoundingClientRect();
    if (anchorRect === undefined) return;
    const maxLeft =
      window.innerWidth - POPOVER_MIN_WIDTH - POPOVER_VIEWPORT_MARGIN;
    setPosition({
      top: anchorRect.bottom + 4,
      left: Math.max(
        POPOVER_VIEWPORT_MARGIN,
        Math.min(anchorRect.left, maxLeft),
      ),
    });
  }, [anchorRef]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      const insideAnchor = anchorRef.current?.contains(event.target) === true;
      const insidePopover = popoverRef.current?.contains(event.target) === true;
      if (!insideAnchor && !insidePopover) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, onClose]);

  const stopEditorFocus = (event: ReactMouseEvent) => event.stopPropagation();

  return (
    <>
      {createPortal(
        <StyledPopover
          ref={popoverRef}
          role="dialog"
          style={{ top: position.top, left: position.left }}
          onMouseDown={stopEditorFocus}
        >
          {children}
        </StyledPopover>,
        document.body,
      )}
    </>
  );
};
