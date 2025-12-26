import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
new Uppy().use(Dashboard, { inline: true, target: '#uppy-dashboard' });
export { Uppy, Dashboard };