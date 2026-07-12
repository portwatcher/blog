import {
  computed,
  getCurrentInstance,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  shallowRef,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type WritableComputedRef,
} from 'vue'
import { type LocationQueryValue } from 'vue-router'

type RouteQueryParser<T> = (value: string | null, defaultValue: T) => T
type RouteQuerySerializer<T> = (
  value: T,
  defaultValue: T,
) => string | null | undefined

const getSingleQueryValue = (
  value: LocationQueryValue | LocationQueryValue[] | undefined,
) => {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export const useRouteQueryState = <T>({
  active,
  key,
  defaultValue,
  parse,
  serialize,
}: {
  active?: MaybeRefOrGetter<boolean>
  key: MaybeRefOrGetter<string>
  defaultValue: MaybeRefOrGetter<T>
  parse: RouteQueryParser<T>
  serialize?: RouteQuerySerializer<T>
}): WritableComputedRef<T> => {
  const route = useRoute()
  const router = useRouter()
  const isBindingActive = ref(true)
  const isBindingEnabled = computed(() => {
    if (active === undefined) return true

    return toValue(active)
  })
  const resolvedDefaultValue: ComputedRef<T> = computed(() =>
    toValue(defaultValue),
  )
  const resolvedKey = computed(() => toValue(key))
  const readQueryValue = () => parse(
    getSingleQueryValue(route.query[resolvedKey.value]),
    resolvedDefaultValue.value,
  )
  const cachedValue = shallowRef(readQueryValue())

  if (getCurrentInstance()) {
    onActivated(() => {
      isBindingActive.value = true
      cachedValue.value = readQueryValue()
    })

    onDeactivated(() => {
      isBindingActive.value = false
    })

    onBeforeUnmount(() => {
      isBindingActive.value = false
    })
  }

  return computed<T>({
    get() {
      if (!isBindingActive.value || !isBindingEnabled.value) {
        return cachedValue.value
      }

      const nextValue = readQueryValue()
      cachedValue.value = nextValue
      return nextValue
    },
    set(value) {
      cachedValue.value = value

      if (!isBindingActive.value || !isBindingEnabled.value) return

      const defaultValue = resolvedDefaultValue.value
      const nextValue = serialize?.(value, defaultValue)
        ?? (value == null ? null : String(value))
      const normalizedNextValue = nextValue == null || nextValue === ''
        ? null
        : nextValue
      const currentValue = getSingleQueryValue(
        route.query[resolvedKey.value],
      )

      if (currentValue === normalizedNextValue) return

      const nextQuery = { ...route.query }

      if (normalizedNextValue == null) {
        delete nextQuery[resolvedKey.value]
      } else {
        nextQuery[resolvedKey.value] = normalizedNextValue
      }

      void router.replace({
        path: route.path,
        query: nextQuery,
        hash: route.hash,
      })
    },
  })
}
