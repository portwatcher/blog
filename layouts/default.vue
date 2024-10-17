<template>
  <div>
    <header>
      <NuxtLink to="/">{{ $t('home') }}</NuxtLink>
      <NuxtLink to="/archive">{{ $t('archive') }}</NuxtLink>
      <NuxtLink
        to="/feed"
        external
      >{{ $t('feed') }}</NuxtLink>
      <NuxtLink to="/shelf">
        {{ $t('shelf') }}
      </NuxtLink>
    </header>

    <div class="container">
      <slot></slot>
    </div>

    <footer></footer>
  </div>
</template>


<style scoped>
header {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  align-items: center;
  gap: 1.5rem;
  color: #333;
  font-size: 14px;
  height: 47px;
  padding: 0 2rem;
  box-sizing: border-box;
  border-bottom: 1px solid #eee;
}

header a:hover {
  color: #d23600;
}

.container {
  width: 100%;
  max-width: 1024px;
  margin-left: auto;
  margin-right: auto;
  padding: 1rem;
  padding-bottom: 5rem;
  box-sizing: border-box;
}
</style>