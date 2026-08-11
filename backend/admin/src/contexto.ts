import { createContext, useContext } from 'react';

/** Dominio do site publico, vindo de SITE_PUBLIC_URL no backend. */
export const CtxSite = createContext('');
export const useSiteUrl = () => useContext(CtxSite);
