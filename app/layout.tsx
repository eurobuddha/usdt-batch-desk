import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Batch Desk',icons:{icon:'/favicon.svg'},description:'Send ETH and ERC-20 batches from any connected wallet on Ethereum.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
