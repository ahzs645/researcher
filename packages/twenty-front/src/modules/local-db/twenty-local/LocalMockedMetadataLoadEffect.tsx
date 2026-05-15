import { isMinimalMetadataReadyState } from '@/metadata-store/states/isMinimalMetadataReadyState';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { useEffect } from 'react';
import { useLoadMockedMetadata } from '~/testing/hooks/useLoadMockedMetadata';

export const LocalMockedMetadataLoadEffect = () => {
  const { loadMockedMetadataAtomic } = useLoadMockedMetadata();
  const setIsMinimalMetadataReady = useSetAtomState(
    isMinimalMetadataReadyState,
  );

  useEffect(() => {
    let isMounted = true;

    void loadMockedMetadataAtomic().then(() => {
      if (isMounted) {
        setIsMinimalMetadataReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [loadMockedMetadataAtomic, setIsMinimalMetadataReady]);

  return null;
};
