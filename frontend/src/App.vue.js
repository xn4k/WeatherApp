import { computed, onMounted, ref } from 'vue';
import { getForecast } from './api/weather';
import DailyForecast from './components/DailyForecast.vue';
import LocationSearch from './components/LocationSearch.vue';
import PaletteControl from './components/PaletteControl.vue';
import WeatherChart from './components/WeatherChart.vue';
import { usePalette } from './composables/usePalette';
import { formatTime, formatUpdated, weatherLabel, windDirection } from './lib/weather';
const { current: palette, automatic: automaticPalette, palettes, nextPalette, toggleAutomatic } = usePalette();
const defaultLocation = {
    id: 0,
    name: 'Köln',
    region: 'Nordrhein-Westfalen',
    country: 'Deutschland',
    latitude: 50.9991,
    longitude: 7.0387,
    timezone: 'Europe/Berlin',
};
const location = ref(defaultLocation);
const forecast = ref(null);
const loading = ref(true);
const error = ref('');
let controller;
const locationLine = computed(() => [location.value.region, location.value.country].filter(Boolean).join(' · '));
const palettePosition = computed(() => palettes.findIndex((item) => item.id === palette.value.id) + 1);
const agreementText = computed(() => {
    const value = forecast.value?.consensus.agreement;
    if (value === 'hoch')
        return 'Die Modelle liegen eng beieinander.';
    if (value === 'mittel')
        return 'Die Modelle zeigen erkennbare Unterschiede.';
    return 'Die Modellspanne ist groß; die Prognose ist unsicher.';
});
async function loadForecast() {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = '';
    try {
        forecast.value = await getForecast(location.value.latitude, location.value.longitude, location.value.name, controller.signal);
    }
    catch (reason) {
        if (reason.name !== 'AbortError') {
            error.value = reason.message;
        }
    }
    finally {
        loading.value = false;
    }
}
function selectLocation(value) {
    location.value = value;
    loadForecast();
}
onMounted(loadForecast);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    href: "/",
    ...{ class: "brand" },
    'aria-label': "ISOBAR Startseite",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "brand-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "claim" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
/** @type {[typeof PaletteControl, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PaletteControl, new PaletteControl({
    ...{ 'onNext': {} },
    ...{ 'onToggle': {} },
    palette: (__VLS_ctx.palette),
    automatic: (__VLS_ctx.automaticPalette),
    position: (__VLS_ctx.palettePosition),
    total: (__VLS_ctx.palettes.length),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onNext': {} },
    ...{ 'onToggle': {} },
    palette: (__VLS_ctx.palette),
    automatic: (__VLS_ctx.automaticPalette),
    position: (__VLS_ctx.palettePosition),
    total: (__VLS_ctx.palettes.length),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onNext: (__VLS_ctx.nextPalette)
};
const __VLS_7 = {
    onToggle: (__VLS_ctx.toggleAutomatic)
};
var __VLS_2;
/** @type {[typeof LocationSearch, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(LocationSearch, new LocationSearch({
    ...{ 'onSelect': {} },
}));
const __VLS_9 = __VLS_8({
    ...{ 'onSelect': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
let __VLS_11;
let __VLS_12;
let __VLS_13;
const __VLS_14 = {
    onSelect: (__VLS_ctx.selectLocation)
};
var __VLS_10;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({});
if (__VLS_ctx.loading && !__VLS_ctx.forecast) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "loading-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "loading-orbit" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
}
else if (__VLS_ctx.error && !__VLS_ctx.forecast) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "error-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.error);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadForecast) },
        type: "button",
    });
}
else if (__VLS_ctx.forecast) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "current-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "location-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.location.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.locationLine);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "current-reading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "temperature" },
    });
    (__VLS_ctx.forecast.current.temperature.toFixed(1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.sup, __VLS_intrinsicElements.sup)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.weatherLabel(__VLS_ctx.forecast.current.weatherCode));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.forecast.current.apparentTemperature.toFixed(1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "data-status" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: ({ stale: __VLS_ctx.forecast.stale }) },
    });
    (__VLS_ctx.forecast.stale ? 'Ältere Daten' : 'Aktualisiert');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formatUpdated(__VLS_ctx.forecast.updatedAt));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadForecast) },
        type: "button",
        disabled: (__VLS_ctx.loading),
    });
    (__VLS_ctx.loading ? 'Lädt …' : 'Neu laden');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "facts-grid" },
        'aria-label': "Aktuelle Wetterwerte",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (Math.round(__VLS_ctx.forecast.current.humidity));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ style: ({ '--fill': `${__VLS_ctx.forecast.current.humidity}%` }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (Math.round(__VLS_ctx.forecast.current.windSpeed));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.windDirection(__VLS_ctx.forecast.current.windDirection));
    (Math.round(__VLS_ctx.forecast.current.windGusts));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (Math.round(__VLS_ctx.forecast.current.pressure));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.formatTime(__VLS_ctx.forecast.daily[0]?.sunset));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.formatTime(__VLS_ctx.forecast.daily[0]?.sunrise));
    /** @type {[typeof WeatherChart, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(WeatherChart, new WeatherChart({
        models: (__VLS_ctx.forecast.models),
        currentTime: (__VLS_ctx.forecast.current.time),
    }));
    const __VLS_16 = __VLS_15({
        models: (__VLS_ctx.forecast.models),
        currentTime: (__VLS_ctx.forecast.current.time),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "model-panel panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "model-intro" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "eyebrow" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.forecast.consensus.todayMax.toFixed(1));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.forecast.consensus.maxSpread.toFixed(1));
    (__VLS_ctx.agreementText);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agreement" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.forecast.consensus.agreement);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agreement-scale" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: ({ active: __VLS_ctx.forecast.consensus.agreement === 'niedrig' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: ({ active: __VLS_ctx.forecast.consensus.agreement === 'mittel' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: ({ active: __VLS_ctx.forecast.consensus.agreement === 'hoch' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "model-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    for (const [model] of __VLS_getVForSourceType((__VLS_ctx.forecast.modelSummaries))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (model.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (model.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (model.todayMin.toFixed(1));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (model.todayMax.toFixed(1));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (Math.round(model.nextSixHourRain));
    }
    /** @type {[typeof DailyForecast, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(DailyForecast, new DailyForecast({
        days: (__VLS_ctx.forecast.daily),
    }));
    const __VLS_19 = __VLS_18({
        days: (__VLS_ctx.forecast.daily),
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "brand footer-brand" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "brand-mark" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
/** @type {__VLS_StyleScopedClasses['app-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['claim']} */ ;
/** @type {__VLS_StyleScopedClasses['loading-state']} */ ;
/** @type {__VLS_StyleScopedClasses['loading-orbit']} */ ;
/** @type {__VLS_StyleScopedClasses['error-state']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['current-section']} */ ;
/** @type {__VLS_StyleScopedClasses['location-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['current-reading']} */ ;
/** @type {__VLS_StyleScopedClasses['temperature']} */ ;
/** @type {__VLS_StyleScopedClasses['data-status']} */ ;
/** @type {__VLS_StyleScopedClasses['stale']} */ ;
/** @type {__VLS_StyleScopedClasses['facts-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['model-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['model-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['agreement']} */ ;
/** @type {__VLS_StyleScopedClasses['agreement-scale']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['model-table']} */ ;
/** @type {__VLS_StyleScopedClasses['table-head']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['footer-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DailyForecast: DailyForecast,
            LocationSearch: LocationSearch,
            PaletteControl: PaletteControl,
            WeatherChart: WeatherChart,
            formatTime: formatTime,
            formatUpdated: formatUpdated,
            weatherLabel: weatherLabel,
            windDirection: windDirection,
            palette: palette,
            automaticPalette: automaticPalette,
            palettes: palettes,
            nextPalette: nextPalette,
            toggleAutomatic: toggleAutomatic,
            location: location,
            forecast: forecast,
            loading: loading,
            error: error,
            locationLine: locationLine,
            palettePosition: palettePosition,
            agreementText: agreementText,
            loadForecast: loadForecast,
            selectLocation: selectLocation,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
