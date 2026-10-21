---
date: "2026-10-21 20:41:00"
tags:
  - Python
  - 算法
cover: /img/posts/leetcode-zui-chang-lian-xu-xu-lie/31627f586ee676413782753ca1dcc8c7-5d3422.webp
top_img: /img/posts/leetcode-zui-chang-lian-xu-xu-lie/31627f586ee676413782753ca1dcc8c7-5d3422.webp
categories: []
title: LeetCode-最长连续序列
---

**给定一个未排序的整数数组 nums ，找出数字连续的最长序列（不要求序列元素在原数组中连续）的长度。

请你设计并实现时间复杂度为 O(n) 的算法解决此问题。**

_示例 1：

输入：nums = [100,4,200,1,3,2]

输出：4

解释：最长数字连续序列是 [1, 2, 3, 4]。它的长度为 4。

示例 2：

输入：nums = [0,3,7,2,5,8,4,6,0,1]

输出：9

示例 3：

输入：nums = [1,0,1,2]

输出：3
_

由于重复的元素不能被重复计算入连续序列的长度当中，因此对于该题目最自然的思路是利用哈希表。考虑到一个连续的序列，唯一的可能结果是两个元素之间的差值为1，因此我们可以利用Python中的集合去实现。

```Python3
   def longestConsecutive(self, nums: list[int]) -> int:
        s = set()
        final_ans = 0
        ans = 0
        for num in nums:
            s.add(num)
        for num in s:
            if (num - 1) not in s:
                i = 1
                while(num + i) in s:
                    i = i + 1
                ans = ans + i
                if ans > final_ans:
                    final_ans = ans
                    ans = 0
                else:ans = 0
                    
        return final_ans  
```

该方法的思路如下：

1.将列表中的元素都添加到集合当中。

2.对于集合中的每个元素，如果比它少1的元素不在集合当中，它才可能成为一个连续序列的开头。

3.如果比这个元素多1的数存在于集合当中，说明这个数是它的后继元素。用一个变量 ans 暂存该连续序列的长度。

4.每找到一个后继元素，将 i + 1 。找到所有后继元素后便可以将i记录的值存入 ans 中，表示该连续序列的最终长度。

5.将 ans 跟 final_ans 比较，确保 final_ans 被更新成最长的 ans 

按该方法便可以找到列表中的最长连续序列。

由于 ans 的写法比较冗余且安全性差，因此可以更新为以下的更佳版本：

```Python3
    def longestConsecutive(self, nums: list[int]) -> int:
        s = set(nums)
        best = 0

        for num in s:
            if num - 1 not in s:
                cur = num
                length = 1

                while cur + 1 in s:
                    cur += 1
                    length += 1

                best = max(best, length)

        return best
```
