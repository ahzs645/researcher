import { type NavigationMenuItem } from '~/generated-metadata/graphql';

export const getLinkNavigationMenuItemComputedLink = (
  item: Pick<NavigationMenuItem, 'link'>,
): string => {
  const linkUrl = (item.link ?? '').trim();
  if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
    return linkUrl;
  }
  // Internal app route (e.g. /discovery) — NavigationDrawerItem renders these as
  // react-router links rather than external https links.
  if (linkUrl.startsWith('/')) {
    return linkUrl;
  }
  return linkUrl ? `https://${linkUrl}` : '';
};
