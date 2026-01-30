import FloatingApp from './components/FloatingApp';

import { I18nProvider } from './i18n/I18nContext';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
    return (
        <I18nProvider>
            <ThemeProvider>
                <div className="w-full h-full bg-transparent">
                    <FloatingApp />
                </div>
            </ThemeProvider>
        </I18nProvider>
    );
}

export default App;
