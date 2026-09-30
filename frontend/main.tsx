import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VouchApp } from './app';
import { DeploymentPage } from './deployment';
import './styles.css';

const deploymentMode = new URLSearchParams(window.location.search).get('deploy') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{deploymentMode ? <DeploymentPage /> : <VouchApp />}</StrictMode>,
);
