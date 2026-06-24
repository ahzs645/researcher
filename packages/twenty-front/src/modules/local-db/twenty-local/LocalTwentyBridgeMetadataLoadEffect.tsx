import { useEffect } from 'react';

import { isMinimalMetadataReadyState } from '@/metadata-store/states/isMinimalMetadataReadyState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { getBridgeWorkspaceSetup } from '@/local-db/data-source/bridgeSystemStore';
import { useLoadMockedMetadata } from '~/testing/hooks/useLoadMockedMetadata';
import { preloadMockedMetadata } from '~/testing/utils/preloadMockedMetadata';

// Bridge mode short-circuits the real metadata fetch. The split-view path goes
// through Apollo's normalized cache which strips fields when our mocked metadata
// responses don't match the schema 1:1, leaving views stuck in `draft-pending`
// and blocking `isMinimalMetadataReadyState`. Loading the preloaded snapshot
// directly into the Jotai metadata store bypasses that path entirely while
// keeping the real GraphQL flow intact for record (data) queries.
export const LocalTwentyBridgeMetadataLoadEffect = () => {
  const { applyMockedMetadata } = useLoadMockedMetadata();
  const setIsMinimalMetadataReady = useSetAtomState(
    isMinimalMetadataReadyState,
  );

  useEffect(() => {
    let isMounted = true;

    void getBridgeWorkspaceSetup()
      .then((setup) =>
        preloadMockedMetadata({
          workspaceMode: setup?.workspaceMode,
        }),
      )
      .then((data) => {
        if (!isMounted) {
          return;
        }

        applyMockedMetadata(data);
        setIsMinimalMetadataReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, [applyMockedMetadata, setIsMinimalMetadataReady]);

  return null;
};
