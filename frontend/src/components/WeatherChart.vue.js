import { computed, ref } from 'vue';
const props = defineProps();
const metric = ref('temperature');
const activeIndex = ref(0);
const chartFocused = ref(false);
const metrics = [
    { id: 'temperature', label: 'Temperatur', unit: '°C' },
    { id: 'precipitationProbability', label: 'Niederschlag', unit: '%' },
    { id: 'windSpeed', label: 'Wind', unit: 'km/h' },
];
const palette = ['var(--model-icon)', 'var(--model-ifs)', 'var(--model-gfs)'];
const visibleModels = computed(() => props.models.map((model) => {
    const currentHour = props.currentTime.slice(0, 13);
    const start = model.hourly.findIndex((point) => point.time.slice(0, 13) >= currentHour);
    return {
        ...model,
        hourly: model.hourly.slice(start < 0 ? 0 : start, (start < 0 ? 0 : start) + 36),
    };
}));
const reference = computed(() => visibleModels.value[0]?.hourly ?? []);
const values = computed(() => visibleModels.value.flatMap((model) => model.hourly.map((point) => point[metric.value])));
const minimum = computed(() => {
    if (metric.value === 'precipitationProbability')
        return 0;
    const value = Math.min(...values.value);
    return Number.isFinite(value) ? Math.floor(value - 2) : 0;
});
const maximum = computed(() => {
    if (metric.value === 'precipitationProbability')
        return 100;
    const value = Math.max(...values.value);
    return Number.isFinite(value) ? Math.ceil(value + 2) : 1;
});
const selectedMetric = computed(() => metrics.find((item) => item.id === metric.value));
function x(index) {
    const count = Math.max(reference.value.length - 1, 1);
    return 60 + (index / count) * 880;
}
function y(value) {
    const range = maximum.value - minimum.value || 1;
    return 300 - ((value - minimum.value) / range) * 240;
}
function points(model) {
    return model.hourly
        .map((point, index) => `${x(index).toFixed(1)},${y(point[metric.value]).toFixed(1)}`)
        .join(' ');
}
function labelTime(value) {
    return new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        hour: '2-digit',
    }).format(new Date(value));
}
function exactTime(value) {
    return new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}
function updatePointer(event) {
    const element = event.currentTarget;
    const bounds = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    activeIndex.value = Math.round(ratio * Math.max(reference.value.length - 1, 0));
}
function onKeydown(event) {
    if (event.key === 'ArrowRight') {
        event.preventDefault();
        activeIndex.value = Math.min(activeIndex.value + 1, reference.value.length - 1);
    }
    if (event.key === 'ArrowLeft') {
        event.preventDefault();
        activeIndex.value = Math.max(activeIndex.value - 1, 0);
    }
}
function pointAt(model) {
    return model.hourly[activeIndex.value];
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "chart-panel panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "panel-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
(__VLS_ctx.selectedMetric.label);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-switcher" },
    'aria-label': "Messgröße auswählen",
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.metrics))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.metric = item.id;
            } },
        key: (item.id),
        type: "button",
        ...{ class: ({ active: __VLS_ctx.metric === item.id }) },
    });
    (item.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "legend" },
    'aria-label': "Wettermodelle",
});
for (const [model, index] of __VLS_getVForSourceType((__VLS_ctx.visibleModels))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (model.id),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ style: ({ backgroundColor: __VLS_ctx.palette[index] }) },
    });
    (model.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chart-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ onPointermove: (__VLS_ctx.updatePointer) },
    ...{ onPointerenter: (...[$event]) => {
            __VLS_ctx.chartFocused = true;
        } },
    ...{ onPointerleave: (...[$event]) => {
            __VLS_ctx.chartFocused = false;
        } },
    ...{ onFocus: (...[$event]) => {
            __VLS_ctx.chartFocused = true;
        } },
    ...{ onBlur: (...[$event]) => {
            __VLS_ctx.chartFocused = false;
        } },
    ...{ onKeydown: (__VLS_ctx.onKeydown) },
    ...{ class: "weather-chart" },
    viewBox: "0 0 1000 360",
    role: "img",
    tabindex: "0",
    'aria-label': (`${__VLS_ctx.selectedMetric.label} der Wettermodelle für 36 Stunden`),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
    ...{ class: "grid" },
});
for (const [step] of __VLS_getVForSourceType((5))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        key: (step),
        x1: "60",
        x2: "940",
        y1: (60 + (step - 1) * 60),
        y2: (60 + (step - 1) * 60),
    });
}
for (const [step] of __VLS_getVForSourceType((5))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
        key: (`label-${step}`),
        x: "48",
        y: (65 + (step - 1) * 60),
        'text-anchor': "end",
    });
    (Math.round(__VLS_ctx.maximum - ((step - 1) / 4) * (__VLS_ctx.maximum - __VLS_ctx.minimum)));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
    ...{ class: "time-labels" },
});
for (const [point, index] of __VLS_getVForSourceType((__VLS_ctx.reference))) {
    (point.time);
    if (index % 6 === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
            x: (__VLS_ctx.x(index)),
            y: "333",
            'text-anchor': (index === 0 ? 'start' : index > __VLS_ctx.reference.length - 5 ? 'end' : 'middle'),
        });
        (__VLS_ctx.labelTime(point.time));
    }
}
for (const [model, index] of __VLS_getVForSourceType((__VLS_ctx.visibleModels))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        key: (model.id),
        ...{ class: "model-line" },
        ...{ style: ({ stroke: __VLS_ctx.palette[index] }) },
        points: (__VLS_ctx.points(model)),
    });
}
if (__VLS_ctx.reference.length && __VLS_ctx.chartFocused) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
        ...{ class: "cursor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: (__VLS_ctx.x(__VLS_ctx.activeIndex)),
        x2: (__VLS_ctx.x(__VLS_ctx.activeIndex)),
        y1: "54",
        y2: "304",
    });
    for (const [model, index] of __VLS_getVForSourceType((__VLS_ctx.visibleModels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            key: (model.id),
            cx: (__VLS_ctx.x(__VLS_ctx.activeIndex)),
            cy: (__VLS_ctx.y(__VLS_ctx.pointAt(model)?.[__VLS_ctx.metric] ?? 0)),
            r: "5",
            ...{ style: ({ fill: __VLS_ctx.palette[index] }) },
        });
    }
}
if (__VLS_ctx.reference.length && __VLS_ctx.chartFocused) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chart-tooltip" },
        ...{ class: ({ right: __VLS_ctx.activeIndex > __VLS_ctx.reference.length / 2 }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.exactTime(__VLS_ctx.reference[__VLS_ctx.activeIndex].time));
    for (const [model, index] of __VLS_getVForSourceType((__VLS_ctx.visibleModels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            key: (model.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
            ...{ style: ({ backgroundColor: __VLS_ctx.palette[index] }) },
        });
        (model.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (__VLS_ctx.pointAt(model)?.[__VLS_ctx.metric]?.toFixed(1));
        (__VLS_ctx.selectedMetric.unit);
    }
}
/** @type {__VLS_StyleScopedClasses['chart-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['legend']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['weather-chart']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['time-labels']} */ ;
/** @type {__VLS_StyleScopedClasses['model-line']} */ ;
/** @type {__VLS_StyleScopedClasses['cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-tooltip']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            metric: metric,
            activeIndex: activeIndex,
            chartFocused: chartFocused,
            metrics: metrics,
            palette: palette,
            visibleModels: visibleModels,
            reference: reference,
            minimum: minimum,
            maximum: maximum,
            selectedMetric: selectedMetric,
            x: x,
            y: y,
            points: points,
            labelTime: labelTime,
            exactTime: exactTime,
            updatePointer: updatePointer,
            onKeydown: onKeydown,
            pointAt: pointAt,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
