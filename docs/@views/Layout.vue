<script setup>
import { useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { nextTick, provide, onMounted, ref } from 'vue'

import Banner from './Banner.vue'
import HomeHero from './home/hero/index.vue'
import HomeTopSponsor from './home/TopSponsor.vue'
import HomeCreateChart from './home/create-chart/index.vue'
import HomeUseCases from './home/UseCases.vue'
import HomeCoreAdvantages from './home/CoreAdvantages.vue'
import HomeUsers from './home/Users.vue'
import HomeSponsor from './home/Sponsor.vue'
// import AsideSponsor from './AsideSponsor.vue'
import NotFound from './NotFound.vue'
<<<<<<< HEAD
=======
import ColorPalette from './ColorPalette.vue'

const { isDark } = useData()

const enableTransitions = () =>
  'startViewTransition' in document &&
  window.matchMedia('(prefers-reduced-motion: no-preference)').matches

provide('toggle-appearance', async ({ clientX: x, clientY: y }) => {
  if (!enableTransitions()) {
    isDark.value = !isDark.value
    return
  }

  const clipPath = [
    `circle(0px at ${x}px ${y}px)`,
    `circle(${Math.hypot(
      Math.max(x, innerWidth - x),
      Math.max(y, innerHeight - y)
    )}px at ${x}px ${y}px)`
  ]

  await document.startViewTransition(async () => {
    isDark.value = !isDark.value
    await nextTick()
  }).ready
 
  document.documentElement.animate(
    { clipPath: isDark.value ? clipPath.reverse() : clipPath },
    {
      duration: 300,
      easing: 'ease-in',
      pseudoElement: `::view-transition-${isDark.value ? 'old' : 'new'}(root)`
    }
  )
})
>>>>>>> f9e0e2ae (docs: update and rebase main into here)
</script>

<template>
  <DefaultTheme.Layout>
    <!-- <template #layout-top>
      <Banner/>
    </template> -->
    <template #home-hero-before>
      <HomeHero/>
      <HomeTopSponsor/>
    </template>
    <template #home-features-after>
      <HomeCreateChart/>
      <HomeCoreAdvantages/>
      <HomeUseCases/>
      <HomeUsers/>
      <HomeSponsor/>
    </template>
    <!-- <template #aside-bottom>
      <AsideSponsor/>
    </template> -->
    <template #not-found>
      <NotFound/>
    </template>
    <template #layout-bottom>
      <ColorPalette/>
    </template>
  </DefaultTheme.Layout>
</template>
