---
title: "phpreg"
description: ""
date: 2024-06-17
draft: false
starred: false
tags: ["wargame", "dreamhack", "web-hacking"]
comments: false
---

![스크린샷 2024-06-17 123648.png](/assets/content/blog/phpreg/screenshot_2024-06-17_123648.png)

```
php로 작성된 페이지입니다.
알맞은 Nickname과 Password를 입력하면 Step 2로 넘어갈 수 있습니다.
Step 2에서 system() 함수를 이용하여 플래그를 획득하세요.
플래그는 ../dream/flag.txt에 위치합니다.
플래그의 형식은 DH{...} 입니다.
```

### `index.php`

![스크린샷 2024-06-17 122850.png](/assets/content/blog/phpreg/screenshot_2024-06-17_122850.png)

파일은 `index.php` 와 `step2.php` 가 제공된다.

`index.php` 에서는 input1, input2 를 받아 POST  로 step2.php 에 넘겨주는 것 말고는 딱히 기능 없음.

`step2.php` 에는 이런 php 코드가 있다.

```php
<?php
    // POST request
    if ($_SERVER["REQUEST_METHOD"] == "POST") {
      $input_name = $_POST["input1"] ? $_POST["input1"] : "";
      $input_pw = $_POST["input2"] ? $_POST["input2"] : "";

      // pw filtering 여기서 PW에 알파벳 있으면 거르고...
      if (preg_match("/[a-zA-Z]/", $input_pw)) {
        echo "alphabet in the pw :(";
      }
      else{
        $name = preg_replace("/nyang/i", "", $input_name); 
        // 이름에 nyang 가 붙어있으면 제거하는데, 이는 각 철자 사이에 nyang 넣으면 간단히 해결됨.
        // dnnyangynyanganyangnnyangg0310
        $pw = preg_replace("/\d*\@\d{2,3}(31)+[^0-8\"]\!/", "d4y0r50ng", $input_pw);
        // 위의 regex 패턴을 따라서 d4y0r50ng 을 만들어주고 뒤에 "+1+13" 만 붙여주면 됨.
        // example : 1@88319!+1+13
        if ($name === "dnyang0310" && $pw === "d4y0r50ng+1+13") {
          echo '<h4>Step 2 : Almost done...</h4><div class="door_box"><div class="door_black"></div><div class="door"><div class="door_cir"></div></div></div>';
```

![스크린샷 2024-06-17 125921.png](/assets/content/blog/phpreg/screenshot_2024-06-17_125921.png)

```php
          $cmd = $_POST["cmd"] ? $_POST["cmd"] : "";

          if ($cmd === "") {
            echo '
                  <p><form method="post" action="/step2.php">
                      <input type="hidden" name="input1" value="'.$input_name.'">
                      <input type="hidden" name="input2" value="'.$input_pw.'">
                      <input type="text" placeholder="Command" name="cmd">
                      <input type="submit" value="제출"><br/><br/>
                  </form></p>
            ';
          }
          // cmd filtering. 직접 flag 를 쓰면 안됨.
          else if (preg_match("/flag/i", $cmd)) {
            echo "<pre>Error!</pre>";
          }
          else{
            echo "<pre>--Output--\n";
            system($cmd);
            echo "</pre>";
          }
        }
        else{
          echo "Wrong nickname or pw";
        }
      }
    }
    // GET request
    else{
      echo "Not GET request";
    }
?>
```

flag 만 안쓰면 되니까 *.txt 로 cat 하면??

![스크린샷 2024-06-17 130452.png](/assets/content/blog/phpreg/screenshot_2024-06-17_130452.png)

![스크린샷 2024-06-17 130449.png](/assets/content/blog/phpreg/screenshot_2024-06-17_130449.png)

🚩
