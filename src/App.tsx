import FloatingApp from './components/FloatingApp';

import { I18nProvider } from './i18n/I18nContext';

function App() {
    return (
        <I18nProvider>
            <div className="w-full h-full bg-transparent">
                <FloatingApp />
            </div>
        </I18nProvider>
    );
}

export default App;
